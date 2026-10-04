<?php
/**
 * Plugin Name:       Faktero pre WooCommerce
 * Plugin URI:        https://www.faktero.sk/pomoc/woocommerce
 * Description:       Z objednávok vystavuje faktúry vo Fakteri — sama, keď je objednávka zaplatená alebo vybavená. Faktúru dostane zákazník v e-maile aj vo svojom účte.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Tobify s. r. o.
 * Author URI:        https://www.faktero.sk
 * License:           GPL-2.0-or-later
 * Text Domain:       faktero-woocommerce
 * WC requires at least: 7.0
 * WC tested up to:   11.1
 */

defined( 'ABSPATH' ) || exit;

define( 'FAKTERO_WC_VERSION', '1.0.0' );

require_once __DIR__ . '/includes/class-faktero-api.php';
require_once __DIR__ . '/includes/class-faktero-objednavka.php';
require_once __DIR__ . '/includes/class-faktero-nastavenia.php';
require_once __DIR__ . '/includes/class-faktero-plugin.php';

/*
  Úložisko objednávok (HPOS) — doplnok pracuje cez WC_Order API, nie cez
  post meta, takže funguje s oboma úložiskami.
*/
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WooCommerce' ) ) {
			add_action(
				'admin_notices',
				function () {
					echo '<div class="notice notice-error"><p>Faktero pre WooCommerce potrebuje zapnutý WooCommerce.</p></div>';
				}
			);
			return;
		}
		Faktero_Plugin::instance();
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=wc-settings&tab=faktero' ) ) . '">Nastavenia</a>' );
		return $links;
	}
);
