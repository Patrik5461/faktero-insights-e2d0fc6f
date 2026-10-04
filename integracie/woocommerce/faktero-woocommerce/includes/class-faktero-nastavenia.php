<?php
/**
 * Záložka „Faktero" vo WooCommerce → Nastavenia.
 */

defined( 'ABSPATH' ) || exit;

class Faktero_Nastavenia {

	const PREDVOLENE = array(
		'adresa'          => 'https://www.faktero.sk',
		'kluc'            => '',
		'kedy'            => 'processing',
		'zaplatena'       => 'yes',
		'poslat'          => 'no',
		'odkaz_v_maile'   => 'yes',
		'storno'          => 'no',
		'splatnost'       => '14',
		'poznamka'        => 'Objednávka č. {cislo}',
		'sku'             => 'no',
		'doprava_zadarmo' => 'no',
		'polia_firmy'     => 'yes',
	);

	/** Hodnoty nastavení aj s predvolenými. */
	public static function hodnoty() {
		$out = array();
		foreach ( self::PREDVOLENE as $k => $v ) {
			$out[ $k ] = get_option( 'faktero_wc_' . $k, $v );
		}
		return $out;
	}

	public static function init() {
		add_filter( 'woocommerce_settings_tabs_array', array( __CLASS__, 'zalozka' ), 60 );
		add_action( 'woocommerce_settings_faktero', array( __CLASS__, 'zobraz' ) );
		add_action( 'woocommerce_update_options_faktero', array( __CLASS__, 'uloz' ) );
	}

	public static function zalozka( $zalozky ) {
		$zalozky['faktero'] = 'Faktero';
		return $zalozky;
	}

	private static function polia() {
		$stavy = array();
		foreach ( wc_get_order_statuses() as $k => $nazov ) {
			$stavy[ substr( $k, 3 ) ] = $nazov;
		}
		return array(
			array(
				'title' => 'Prepojenie s Fakterom',
				'type'  => 'title',
				'desc'  => 'API kľúč vytvoríte vo Fakteri v menu pod avatarom → <strong>API kľúče</strong> (režim Live). Faktúry sa vystavia vo firme, ktorej kľúč patrí.',
				'id'    => 'faktero_wc_prepojenie',
			),
			array(
				'title'    => 'API kľúč',
				'id'       => 'faktero_wc_kluc',
				'type'     => 'password',
				'default'  => '',
				'desc_tip' => 'Začína sa „fk_live_" alebo „fk_test_".',
			),
			array(
				'title'   => 'Adresa Faktera',
				'id'      => 'faktero_wc_adresa',
				'type'    => 'text',
				'default' => self::PREDVOLENE['adresa'],
				'desc'    => 'Meniť netreba.',
			),
			array(
				'type' => 'sectionend',
				'id'   => 'faktero_wc_prepojenie',
			),
			array(
				'title' => 'Kedy vystaviť faktúru',
				'type'  => 'title',
				'id'    => 'faktero_wc_kedy_sekcia',
			),
			array(
				'title'   => 'Pri stave objednávky',
				'id'      => 'faktero_wc_kedy',
				'type'    => 'select',
				'default' => self::PREDVOLENE['kedy'],
				'options' => $stavy,
				'desc'    => '„Spracováva sa" = zaplatená kartou alebo potvrdená. Pri prevode na účet sa objednávka do tohto stavu dostane, až keď platbu potvrdíte.',
			),
			array(
				'title'   => 'Zaplatené objednávky',
				'id'      => 'faktero_wc_zaplatena',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['zaplatena'],
				'desc'    => 'Faktúru zaplatenej objednávky hneď označiť ako uhradenú',
			),
			array(
				'title'   => 'Splatnosť (dni)',
				'id'      => 'faktero_wc_splatnost',
				'type'    => 'number',
				'default' => self::PREDVOLENE['splatnost'],
				'custom_attributes' => array( 'min' => 0, 'max' => 90 ),
				'desc'    => 'Pre nezaplatené objednávky. Zaplatená je splatná dňom vystavenia.',
			),
			array(
				'title'   => 'Zrušená objednávka',
				'id'      => 'faktero_wc_storno',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['storno'],
				'desc'    => 'Pri zrušení objednávky stornovať jej nezaplatenú faktúru',
			),
			array(
				'type' => 'sectionend',
				'id'   => 'faktero_wc_kedy_sekcia',
			),
			array(
				'title' => 'Faktúra a zákazník',
				'type'  => 'title',
				'id'    => 'faktero_wc_zakaznik',
			),
			array(
				'title'   => 'Poznámka na faktúre',
				'id'      => 'faktero_wc_poznamka',
				'type'    => 'text',
				'default' => self::PREDVOLENE['poznamka'],
				'desc'    => '{cislo} sa nahradí číslom objednávky.',
			),
			array(
				'title'   => 'Odkaz v e-maile',
				'id'      => 'faktero_wc_odkaz_v_maile',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['odkaz_v_maile'],
				'desc'    => 'Pridať odkaz na faktúru (PDF) do e-mailov WooCommerce o objednávke',
			),
			array(
				'title'   => 'E-mail z Faktera',
				'id'      => 'faktero_wc_poslat',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['poslat'],
				'desc'    => 'Poslať zákazníkovi faktúru aj samostatným e-mailom z Faktera',
			),
			array(
				'title'   => 'Polia pre firmu v pokladni',
				'id'      => 'faktero_wc_polia_firmy',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['polia_firmy'],
				'desc'    => 'Pridať do pokladne IČO, DIČ a IČ DPH (klasická pokladňa)',
			),
			array(
				'title'   => 'Kód produktu',
				'id'      => 'faktero_wc_sku',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['sku'],
				'desc'    => 'Pripísať k názvu položky kód produktu (SKU)',
			),
			array(
				'title'   => 'Doprava zadarmo',
				'id'      => 'faktero_wc_doprava_zadarmo',
				'type'    => 'checkbox',
				'default' => self::PREDVOLENE['doprava_zadarmo'],
				'desc'    => 'Uviesť na faktúre aj dopravu za 0 €',
			),
			array(
				'type' => 'sectionend',
				'id'   => 'faktero_wc_zakaznik',
			),
		);
	}

	public static function zobraz() {
		woocommerce_admin_fields( self::polia() );
	}

	public static function uloz() {
		woocommerce_update_options( self::polia() );
		$n   = self::hodnoty();
		$api = new Faktero_Api( $n['adresa'], $n['kluc'] );
		if ( ! $api->ma_kluc() ) {
			return;
		}
		try {
			$api->over();
			WC_Admin_Settings::add_message( 'Pripojenie k Fakteru funguje.' );
		} catch ( Faktero_Api_Chyba $e ) {
			WC_Admin_Settings::add_error( 'Faktero kľúč neprijalo: ' . $e->getMessage() );
		}
	}
}
