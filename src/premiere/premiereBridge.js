/**
 * Ponto único de acesso ao módulo "premierepro" (Premiere DOM APIs).
 * Mantém o restante do plugin desacoplado do require() direto, então uma
 * eventual mudança na forma de obter a API fica isolada aqui.
 */

const ppro = require("premierepro");

module.exports = ppro;
