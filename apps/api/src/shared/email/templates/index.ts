/**
 * Point d'entrée centralisé pour tous les templates emails transactionnels.
 * À utiliser depuis les services métier (orders, negotiations, payments) :
 *
 *   import { renderOrderCreated } from "../../shared/email/templates/index.js";
 */

export * from "./layout.js";
export * from "./order.js";
export * from "./negotiation.js";
export * from "./payment.js";
