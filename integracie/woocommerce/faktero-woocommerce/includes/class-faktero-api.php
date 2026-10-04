<?php
/**
 * Volania na API Faktera (https://www.faktero.sk/api/v1).
 */

defined( 'ABSPATH' ) || exit;

class Faktero_Api_Chyba extends Exception {
	/** @var int */
	public $stav;
	/** @var string */
	public $kod;

	public function __construct( $sprava, $stav = 0, $kod = '' ) {
		parent::__construct( $sprava );
		$this->stav = (int) $stav;
		$this->kod  = (string) $kod;
	}

	/** Chyba, pri ktorej má zmysel skúsiť to neskôr znova (výpadok, preťaženie). */
	public function docasna() {
		return 0 === $this->stav || 429 === $this->stav || $this->stav >= 500;
	}
}

class Faktero_Api {
	/** @var string */
	private $zaklad;
	/** @var string */
	private $kluc;

	public function __construct( $adresa, $kluc ) {
		$this->zaklad = rtrim( $adresa ? $adresa : 'https://www.faktero.sk', '/' ) . '/api/v1';
		$this->kluc   = trim( (string) $kluc );
	}

	public function ma_kluc() {
		return '' !== $this->kluc;
	}

	/**
	 * @return array Telo odpovede.
	 * @throws Faktero_Api_Chyba
	 */
	public function volaj( $metoda, $cesta, $telo = null ) {
		if ( ! $this->ma_kluc() ) {
			throw new Faktero_Api_Chyba( 'Chýba API kľúč — doplňte ho vo WooCommerce → Nastavenia → Faktero.', 401, 'missing_api_key' );
		}
		$args = array(
			'method'  => $metoda,
			'timeout' => 25,
			'headers' => array(
				'Authorization' => 'Bearer ' . $this->kluc,
				'Accept'        => 'application/json',
				'User-Agent'    => 'faktero-woocommerce/' . FAKTERO_WC_VERSION . '; ' . home_url(),
			),
		);
		if ( null !== $telo ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = wp_json_encode( $telo );
		}
		$odpoved = wp_remote_request( $this->zaklad . $cesta, $args );
		if ( is_wp_error( $odpoved ) ) {
			throw new Faktero_Api_Chyba( 'Faktero je nedostupné: ' . $odpoved->get_error_message(), 0, 'network' );
		}
		$stav = (int) wp_remote_retrieve_response_code( $odpoved );
		$data = json_decode( (string) wp_remote_retrieve_body( $odpoved ), true );
		if ( $stav >= 200 && $stav < 300 ) {
			return is_array( $data ) ? $data : array();
		}
		$chyba = is_array( $data ) && isset( $data['error'] ) && is_array( $data['error'] ) ? $data['error'] : array();
		$sprava = isset( $chyba['message'] ) ? $chyba['message'] : 'HTTP ' . $stav;
		if ( ! empty( $chyba['details']['fieldErrors'] ) && is_array( $chyba['details']['fieldErrors'] ) ) {
			$polia = array();
			foreach ( $chyba['details']['fieldErrors'] as $pole => $chyby ) {
				$polia[] = $pole . ': ' . implode( ', ', (array) $chyby );
			}
			$sprava .= ' (' . implode( '; ', $polia ) . ')';
		}
		throw new Faktero_Api_Chyba( $sprava, $stav, isset( $chyba['code'] ) ? $chyba['code'] : '' );
	}

	public function vystav_fakturu( array $faktura ) {
		$r = $this->volaj( 'POST', '/invoices', $faktura );
		return isset( $r['data'] ) && is_array( $r['data'] ) ? $r['data'] : $r;
	}

	public function oznac_zaplatenu( $id ) {
		try {
			$this->volaj( 'POST', '/invoices/' . rawurlencode( $id ) . '/mark-paid' );
		} catch ( Faktero_Api_Chyba $e ) {
			// Už zaplatená nie je chyba — opakovaný pokus po výpadku ju tak nájde.
			if ( 'invalid_state' !== $e->kod ) {
				throw $e;
			}
		}
	}

	public function posli_zakaznikovi( $id ) {
		return $this->volaj( 'POST', '/invoices/' . rawurlencode( $id ) . '/send', new stdClass() );
	}

	public function stornuj( $id ) {
		return $this->volaj( 'POST', '/invoices/' . rawurlencode( $id ) . '/cancel' );
	}

	/** Podpísaná adresa PDF, platná hodinu. */
	public function odkaz_na_pdf( $id ) {
		$r = $this->volaj( 'GET', '/invoices/' . rawurlencode( $id ) . '/pdf' );
		$d = isset( $r['data'] ) && is_array( $r['data'] ) ? $r['data'] : $r;
		if ( empty( $d['url'] ) ) {
			throw new Faktero_Api_Chyba( 'Faktero nevrátilo odkaz na PDF.', 500, 'no_url' );
		}
		return $d['url'];
	}

	/** Overenie kľúča — najlacnejšie volanie, ktoré kľúč potrebuje. */
	public function over() {
		$this->volaj( 'GET', '/invoices?limit=1' );
	}
}
