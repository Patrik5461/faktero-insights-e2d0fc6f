<?php
/**
 * Kedy sa faktúra vystaví, opakovanie pri výpadku, odkazy na PDF.
 */

defined( 'ABSPATH' ) || exit;

class Faktero_Plugin {

	const AKCIA         = 'faktero_vystav_fakturu';
	const META_ID       = '_faktero_invoice_id';
	const META_CISLO    = '_faktero_invoice_number';
	const META_POKUSY   = '_faktero_pokusy';
	const MAX_POKUSOV   = 5;

	/** @var Faktero_Plugin|null */
	private static $instancia = null;

	public static function instance() {
		if ( null === self::$instancia ) {
			self::$instancia = new self();
		}
		return self::$instancia;
	}

	private function __construct() {
		Faktero_Nastavenia::init();
		$n = Faktero_Nastavenia::hodnoty();

		add_action( 'woocommerce_order_status_' . $n['kedy'], array( $this, 'naplanuj' ), 20 );
		add_action( 'woocommerce_order_status_changed', array( $this, 'zmena_stavu' ), 20, 3 );
		add_action( self::AKCIA, array( $this, 'vystav' ), 10, 1 );

		add_filter( 'woocommerce_order_actions', array( $this, 'akcie_objednavky' ), 10, 2 );
		add_action( 'woocommerce_order_action_faktero_vystav', array( $this, 'akcia_vystav' ) );
		add_action( 'woocommerce_admin_order_data_after_order_details', array( $this, 'admin_panel' ) );

		add_action( 'init', array( $this, 'stiahnutie_pdf' ) );
		add_filter( 'woocommerce_my_account_my_orders_actions', array( $this, 'akcia_v_ucte' ), 10, 2 );
		add_action( 'woocommerce_order_details_after_order_table', array( $this, 'odkaz_v_detaile' ) );
		add_action( 'woocommerce_email_after_order_table', array( $this, 'odkaz_v_maile' ), 10, 4 );

		if ( 'yes' === $n['polia_firmy'] ) {
			add_filter( 'woocommerce_billing_fields', array( $this, 'polia_firmy' ) );
			add_action( 'woocommerce_init', array( $this, 'polia_firmy_bloky' ) );
		}
	}

	private function api() {
		$n = Faktero_Nastavenia::hodnoty();
		return new Faktero_Api( $n['adresa'], $n['kluc'] );
	}

	/*
	  Vystavenie beží mimo požiadavky zákazníka (Action Scheduler je súčasťou
	  WooCommerce). Inak by pokladňa po zaplatení čakala na Faktero, a keby bolo
	  práve nedostupné, zákazník by to videl.
	*/
	public function naplanuj( $order_id, $oneskorenie = 0 ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || $order->get_meta( self::META_ID ) ) {
			return;
		}
		if ( function_exists( 'as_schedule_single_action' ) ) {
			if ( ! as_has_scheduled_action( self::AKCIA, array( (int) $order_id ), 'faktero' ) ) {
				as_schedule_single_action( time() + (int) $oneskorenie, self::AKCIA, array( (int) $order_id ), 'faktero' );
			}
			return;
		}
		$this->vystav( $order_id );
	}

	/** Vystaví faktúru k objednávke. Bezpečné spustiť viackrát. */
	public function vystav( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || $order->get_meta( self::META_ID ) ) {
			return;
		}
		$n   = Faktero_Nastavenia::hodnoty();
		$api = $this->api();
		try {
			$faktura = $api->vystav_fakturu( Faktero_Objednavka::faktura( $order, $n ) );
			if ( empty( $faktura['id'] ) ) {
				throw new Faktero_Api_Chyba( 'Faktero nevrátilo vystavenú faktúru.', 500 );
			}
			$order->update_meta_data( self::META_ID, $faktura['id'] );
			$order->update_meta_data( self::META_CISLO, isset( $faktura['invoice_number'] ) ? $faktura['invoice_number'] : '' );
			$order->delete_meta_data( self::META_POKUSY );
			$order->save();

			$cislo = isset( $faktura['invoice_number'] ) ? $faktura['invoice_number'] : $faktura['id'];
			$order->add_order_note( 'Faktero: vystavená faktúra ' . $cislo . '.' );

			// Faktero počíta DPH z riadkov; obchod mohol zaokrúhliť inak.
			if ( isset( $faktura['total'] ) && abs( (float) $faktura['total'] - (float) $order->get_total() ) >= 0.01 ) {
				$order->add_order_note(
					sprintf(
						'Faktero: suma faktúry %s sa líši od objednávky %s (zaokrúhlenie DPH). Skontrolujte faktúru.',
						wc_format_decimal( $faktura['total'], 2 ),
						wc_format_decimal( $order->get_total(), 2 )
					)
				);
			}

			if ( 'yes' === $n['zaplatena'] && Faktero_Objednavka::zaplatena( $order ) ) {
				$api->oznac_zaplatenu( $faktura['id'] );
			}
			if ( 'yes' === $n['poslat'] && $order->get_billing_email() ) {
				try {
					$api->posli_zakaznikovi( $faktura['id'] );
					$order->add_order_note( 'Faktero: faktúra odoslaná zákazníkovi e-mailom.' );
				} catch ( Faktero_Api_Chyba $e ) {
					$order->add_order_note( 'Faktero: faktúru sa nepodarilo odoslať e-mailom — ' . $e->getMessage() );
				}
			}
		} catch ( Faktero_Api_Chyba $e ) {
			$this->zlyhanie( $order, $e );
		}
	}

	private function zlyhanie( WC_Order $order, Faktero_Api_Chyba $e ) {
		$pokusy = (int) $order->get_meta( self::META_POKUSY ) + 1;
		$order->update_meta_data( self::META_POKUSY, $pokusy );
		$order->save();
		if ( $e->docasna() && $pokusy < self::MAX_POKUSOV && function_exists( 'as_schedule_single_action' ) ) {
			// 5, 10, 20, 40 minút.
			$za = 300 * ( 2 ** ( $pokusy - 1 ) );
			as_schedule_single_action( time() + $za, self::AKCIA, array( (int) $order->get_id() ), 'faktero' );
			$order->add_order_note( sprintf( 'Faktero: faktúru sa nepodarilo vystaviť (%s). Skúsim znova o %d min.', $e->getMessage(), $za / 60 ) );
			return;
		}
		$order->add_order_note( 'Faktero: faktúra nevystavená — ' . $e->getMessage() . ' Po oprave ju vystavíte v akciách objednávky („Vystaviť faktúru vo Fakteri").' );
	}

	public function zmena_stavu( $order_id, $z, $na ) {
		$n     = Faktero_Nastavenia::hodnoty();
		$order = wc_get_order( $order_id );
		if ( 'completed' === $na && $order && 'cod' === $order->get_payment_method() && 'yes' === $n['zaplatena'] && $order->get_meta( self::META_ID ) ) {
			// Dobierka je vybavená — kuriér peniaze vybral, faktúra je uhradená.
			try {
				$this->api()->oznac_zaplatenu( $order->get_meta( self::META_ID ) );
				$order->add_order_note( 'Faktero: faktúra za dobierku označená ako uhradená.' );
			} catch ( Faktero_Api_Chyba $e ) {
				$order->add_order_note( 'Faktero: faktúru sa nepodarilo označiť ako uhradenú — ' . $e->getMessage() );
			}
			return;
		}
		if ( 'cancelled' !== $na ) {
			return;
		}
		if ( 'yes' !== $n['storno'] || ! $order ) {
			return;
		}
		$id = $order->get_meta( self::META_ID );
		if ( ! $id || Faktero_Objednavka::zaplatena( $order ) ) {
			return;
		}
		try {
			$this->api()->stornuj( $id );
			$order->add_order_note( 'Faktero: faktúra stornovaná.' );
		} catch ( Faktero_Api_Chyba $e ) {
			$order->add_order_note( 'Faktero: faktúru sa nepodarilo stornovať — ' . $e->getMessage() );
		}
	}

	public function akcie_objednavky( $akcie, $order = null ) {
		if ( $order instanceof WC_Order && ! $order->get_meta( self::META_ID ) ) {
			$akcie['faktero_vystav'] = 'Vystaviť faktúru vo Fakteri';
		}
		return $akcie;
	}

	public function akcia_vystav( WC_Order $order ) {
		$order->delete_meta_data( self::META_POKUSY );
		$order->save();
		$this->vystav( $order->get_id() );
	}

	public function admin_panel( WC_Order $order ) {
		$cislo = $order->get_meta( self::META_CISLO );
		echo '<p class="form-field form-field-wide"><strong>Faktúra (Faktero):</strong><br>';
		if ( $order->get_meta( self::META_ID ) ) {
			printf(
				'%s · <a href="%s" target="_blank" rel="noopener">Stiahnuť PDF</a>',
				esc_html( $cislo ? $cislo : 'vystavená' ),
				esc_url( $this->odkaz_pdf( $order ) )
			);
		} else {
			echo 'zatiaľ nevystavená';
		}
		echo '</p>';
	}

	/** Odkaz na PDF chránený kľúčom objednávky — funguje aj pre nákup bez registrácie. */
	private function odkaz_pdf( WC_Order $order ) {
		return add_query_arg(
			array(
				'faktero_faktura' => $order->get_id(),
				'key'             => $order->get_order_key(),
			),
			home_url( '/' )
		);
	}

	public function stiahnutie_pdf() {
		if ( empty( $_GET['faktero_faktura'] ) ) {
			return;
		}
		$order = wc_get_order( absint( $_GET['faktero_faktura'] ) );
		$kluc  = isset( $_GET['key'] ) ? sanitize_text_field( wp_unslash( $_GET['key'] ) ) : '';
		if ( ! $order || ! hash_equals( (string) $order->get_order_key(), $kluc ) || ! $order->get_meta( self::META_ID ) ) {
			wp_die( 'Faktúra nenájdená.', 'Faktúra', array( 'response' => 404 ) );
		}
		try {
			// Podpísaná adresa platí hodinu, preto sa pýta pri každom kliknutí.
			wp_redirect( $this->api()->odkaz_na_pdf( $order->get_meta( self::META_ID ) ) );
			exit;
		} catch ( Faktero_Api_Chyba $e ) {
			wp_die( 'Faktúru sa teraz nepodarilo načítať. Skúste to o chvíľu.', 'Faktúra', array( 'response' => 503 ) );
		}
	}

	public function akcia_v_ucte( $akcie, $order ) {
		if ( $order instanceof WC_Order && $order->get_meta( self::META_ID ) ) {
			$akcie['faktero_faktura'] = array(
				'url'  => $this->odkaz_pdf( $order ),
				'name' => 'Faktúra',
			);
		}
		return $akcie;
	}

	public function odkaz_v_detaile( $order ) {
		if ( $order instanceof WC_Order && $order->get_meta( self::META_ID ) ) {
			printf(
				'<p class="faktero-faktura"><a class="button" href="%s" target="_blank" rel="noopener">Stiahnuť faktúru %s (PDF)</a></p>',
				esc_url( $this->odkaz_pdf( $order ) ),
				esc_html( $order->get_meta( self::META_CISLO ) )
			);
		}
	}

	public function odkaz_v_maile( $order, $pre_admina, $obycajny_text, $email = null ) {
		$n = Faktero_Nastavenia::hodnoty();
		if ( $pre_admina || 'yes' !== $n['odkaz_v_maile'] || ! ( $order instanceof WC_Order ) || ! $order->get_meta( self::META_ID ) ) {
			return;
		}
		$url = $this->odkaz_pdf( $order );
		if ( $obycajny_text ) {
			echo "\nFaktúra (PDF): " . esc_url_raw( $url ) . "\n";
		} else {
			printf( '<p><a href="%s">Stiahnuť faktúru %s (PDF)</a></p>', esc_url( $url ), esc_html( $order->get_meta( self::META_CISLO ) ) );
		}
	}

	/*
	  Tie isté polia v pokladni z blokov (predvolená od WooCommerce 8.3). Klasický
	  filter ju neovplyvní; bloky majú vlastné rozhranie na doplnkové polia.
	  Sekcia „contact" — pri adrese by sa polia zopakovali aj v dodacej adrese.
	*/
	public function polia_firmy_bloky() {
		if ( ! function_exists( 'woocommerce_register_additional_checkout_field' ) ) {
			return;
		}
		foreach ( array( 'ico' => 'IČO (nákup na firmu)', 'dic' => 'DIČ', 'ic_dph' => 'IČ DPH' ) as $kluc => $nazov ) {
			woocommerce_register_additional_checkout_field(
				array(
					'id'       => 'faktero/' . $kluc,
					'label'    => $nazov,
					'location' => 'contact',
					'type'     => 'text',
					'required' => false,
				)
			);
		}
	}

	/*
	  Polia pre nákup na firmu. Ukladajú sa ako `_billing_ico` atď., teda pod
	  menami, ktoré používajú aj iné slovenské doplnky — keď už nejaký beží,
	  doplnok pole nepridá druhýkrát.
	*/
	public function polia_firmy( $polia ) {
		$nove = array(
			'billing_ico'    => 'IČO',
			'billing_dic'    => 'DIČ',
			'billing_ic_dph' => 'IČ DPH',
		);
		$poradie = 31;
		foreach ( $nove as $kluc => $nazov ) {
			if ( isset( $polia[ $kluc ] ) ) {
				continue;
			}
			$polia[ $kluc ] = array(
				'label'    => $nazov,
				'required' => false,
				'class'    => array( 'form-row-wide' ),
				'priority' => $poradie++,
			);
		}
		return $polia;
	}
}
