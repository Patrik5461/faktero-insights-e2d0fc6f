<?php
/**
 * Z objednávky WooCommerce poskladá faktúru pre API Faktera.
 */

defined( 'ABSPATH' ) || exit;

class Faktero_Objednavka {

	/** Meta kľúče, pod ktorými IČO/DIČ/IČ DPH ukladajú bežné slovenské doplnky pokladne. */
	/* Prvé sú polia z pokladne z blokov (`_wc_other/…`), potom klasická pokladňa. */
	const KLUCE_ICO    = array( '_wc_other/faktero/ico', '_billing_ico', 'billing_ico', '_billing_company_id', '_billing_ic', 'billing_ic' );
	const KLUCE_DIC    = array( '_wc_other/faktero/dic', '_billing_dic', 'billing_dic', '_billing_tax_id' );
	const KLUCE_IC_DPH = array( '_wc_other/faktero/ic_dph', '_billing_ic_dph', 'billing_ic_dph', '_billing_icdph', '_billing_dic_dph', '_billing_vat_number', '_vat_number', 'vat_number' );

	/**
	 * Jednoznačná značka objednávky pre `external_id`. Faktero podľa nej
	 * spozná opakovaný pokus a vráti už vystavenú faktúru — dvakrát ju nevystaví,
	 * ani keď sa požiadavka po výpadku zopakuje.
	 */
	public static function znacka( WC_Order $o ) {
		return 'woo-' . substr( md5( home_url() ), 0, 8 ) . '-' . $o->get_id();
	}

	/** Spôsob úhrady vo Fakteri podľa platobnej brány. */
	public static function sposob_uhrady( $brana ) {
		switch ( (string) $brana ) {
			case 'bacs':
			case 'cheque':
				return 'bank_transfer';
			case 'cod':
				// Dobierku inkasuje kuriér v hotovosti.
				return 'cash';
			default:
				// Platobné brány (karta, Google Pay, GoPay, Besteron, PayPal…).
				return 'card';
		}
	}

	/*
	  Je objednávka naozaj zaplatená? WooCommerce za zaplatenú považuje každú
	  v stave „Spracováva sa" — aj dobierku, ktorú kuriér ešte nevybral. Tá je
	  zaplatená až po doručení, teda keď je objednávka vybavená.
	*/
	public static function zaplatena( WC_Order $o ) {
		if ( 'cod' === $o->get_payment_method() ) {
			return $o->has_status( 'completed' );
		}
		return $o->is_paid();
	}

	private static function meta( WC_Order $o, array $kluce ) {
		foreach ( $kluce as $k ) {
			$v = trim( (string) $o->get_meta( $k ) );
			if ( '' !== $v ) {
				return $v;
			}
		}
		return '';
	}

	/**
	 * Sadzba DPH riadku. Prednostne z nastavenej sadzby WooCommerce; keď ju
	 * nemá (ručne upravená objednávka), dopočíta sa z dane a sumy.
	 */
	private static function sadzba( WC_Order_Item $p, $zaklad, $dan ) {
		$dane = $p->get_taxes();
		if ( ! empty( $dane['total'] ) ) {
			foreach ( $dane['total'] as $rate_id => $suma ) {
				if ( '' !== $suma && null !== $suma ) {
					$percento = WC_Tax::get_rate_percent_value( $rate_id );
					if ( $percento > 0 ) {
						return round( (float) $percento, 2 );
					}
				}
			}
		}
		if ( abs( $zaklad ) < 0.005 ) {
			return 0;
		}
		return round( $dan / $zaklad * 100 );
	}

	private static function riadok( $nazov, $mnozstvo, $zaklad, $dan, $sadzba, $jednotka = 'ks' ) {
		$mnozstvo = $mnozstvo > 0 ? (float) $mnozstvo : 1;
		// Štyri desatinné miesta stačia, kým súčin s množstvom sedí na cent;
		// pri veľkom množstve treba piate (viac Faktero neuloží).
		$cena = round( $zaklad / $mnozstvo, 4 );
		if ( abs( $cena * $mnozstvo - $zaklad ) > 0.005 ) {
			$cena = round( $zaklad / $mnozstvo, 5 );
		}
		return array(
			'name'       => mb_substr( wp_strip_all_tags( $nazov ), 0, 255 ),
			'quantity'   => $mnozstvo,
			'unit'       => $jednotka,
			// Cena za kus po zľave z kupónu, bez DPH.
			'unit_price' => $cena,
			'vat_rate'   => $sadzba,
			/*
			  Základ a DPH presne podľa obchodu. WooCommerce ráta daň z
			  nezaokrúhleného základu; Faktero by ju inak prepočítalo zo
			  zaokrúhleného a faktúra by sa od objednávky líšila o cent.
			*/
			'subtotal'   => round( $zaklad, 2 ),
			'vat_amount' => round( $dan, 2 ),
		);
	}

	/**
	 * @return array Telo pre POST /invoices.
	 * @throws Faktero_Api_Chyba Keď sa objednávka nedá verne preniesť.
	 */
	public static function faktura( WC_Order $o, array $nastavenia ) {
		$polozky = array();

		foreach ( $o->get_items( 'line_item' ) as $p ) {
			/** @var WC_Order_Item_Product $p */
			$zaklad = (float) $p->get_total();
			$dan    = (float) $p->get_total_tax();
			$nazov  = $p->get_name();
			$produkt = $p->get_product();
			if ( $produkt && $produkt->get_sku() && 'yes' === $nastavenia['sku'] ) {
				$nazov .= ' (' . $produkt->get_sku() . ')';
			}
			$polozky[] = self::riadok( $nazov, $p->get_quantity(), $zaklad, $dan, self::sadzba( $p, $zaklad, $dan ) );
		}

		foreach ( $o->get_items( 'shipping' ) as $p ) {
			$zaklad = (float) $p->get_total();
			if ( $zaklad <= 0 && 'yes' !== $nastavenia['doprava_zadarmo'] ) {
				continue;
			}
			$dan       = (float) $p->get_total_tax();
			$polozky[] = self::riadok( 'Doprava: ' . $p->get_name(), 1, $zaklad, $dan, self::sadzba( $p, $zaklad, $dan ) );
		}

		foreach ( $o->get_items( 'fee' ) as $p ) {
			$zaklad = (float) $p->get_total();
			if ( $zaklad < 0 ) {
				/*
				  Záporný poplatok (zľava pridaná doplnkom) sa do položky s kladnou
				  cenou zapísať nedá a vynechať ho by znamenalo faktúru na vyššiu
				  sumu, než zákazník zaplatil. Radšej nech ju človek vystaví ručne.
				*/
				throw new Faktero_Api_Chyba( 'Objednávka má zápornú položku „' . $p->get_name() . '" — faktúru vystavte vo Fakteri ručne.', 422, 'negative_fee' );
			}
			$dan       = (float) $p->get_total_tax();
			$polozky[] = self::riadok( $p->get_name(), 1, $zaklad, $dan, self::sadzba( $p, $zaklad, $dan ) );
		}

		if ( empty( $polozky ) ) {
			throw new Faktero_Api_Chyba( 'Objednávka nemá žiadne položky.', 422, 'no_items' );
		}

		$firma = trim( (string) $o->get_billing_company() );
		$meno  = trim( $o->get_billing_first_name() . ' ' . $o->get_billing_last_name() );
		$ulica = trim( $o->get_billing_address_1() . ' ' . $o->get_billing_address_2() );

		$odberatel = array_filter(
			array(
				'name'    => '' !== $firma ? $firma : ( '' !== $meno ? $meno : 'Zákazník' ),
				'ico'     => self::meta( $o, self::KLUCE_ICO ),
				'dic'     => self::meta( $o, self::KLUCE_DIC ),
				'ic_dph'  => self::meta( $o, self::KLUCE_IC_DPH ),
				'street'  => $ulica,
				'city'    => $o->get_billing_city(),
				'zip'     => $o->get_billing_postcode(),
				'country' => strtoupper( (string) $o->get_billing_country() ),
				'email'   => is_email( $o->get_billing_email() ) ? $o->get_billing_email() : '',
			),
			function ( $v ) {
				return '' !== $v && null !== $v;
			}
		);

		$dnes      = current_time( 'Y-m-d' );
		$zaplatena = self::zaplatena( $o );
		$dni       = max( 0, (int) $nastavenia['splatnost'] );
		$dodanie   = $o->get_date_paid() ? $o->get_date_paid() : $o->get_date_created();

		$poznamka = str_replace( '{cislo}', $o->get_order_number(), (string) $nastavenia['poznamka'] );
		if ( 'cod' === $o->get_payment_method() ) {
			// PDF zalomenia riadkov nezachová, preto oddeľovač v texte.
			$poznamka = '' !== trim( $poznamka ) ? rtrim( $poznamka, ' .' ) . '. Úhrada na dobierku.' : 'Úhrada na dobierku.';
		}

		return array(
			'external_id'     => self::znacka( $o ),
			'order_number'    => (string) $o->get_order_number(),
			'customer'        => $odberatel,
			'issue_date'      => $dnes,
			'delivery_date'   => $dodanie ? $dodanie->date_i18n( 'Y-m-d' ) : $dnes,
			// Zaplatená objednávka je splatná hneď — inak by faktúra ešte dva týždne visela ako neuhradená.
			'due_date'        => $zaplatena ? $dnes : gmdate( 'Y-m-d', strtotime( $dnes . ' +' . $dni . ' days' ) ),
			'currency'        => $o->get_currency(),
			'payment_method'  => self::sposob_uhrady( $o->get_payment_method() ),
			'notes'           => '' !== trim( $poznamka ) ? $poznamka : null,
			'items'           => $polozky,
		);
	}
}
