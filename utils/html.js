// Escapa los caracteres con significado especial en HTML.
// Se usa SIEMPRE antes de insertar texto del visitante dentro de una plantilla HTML.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// Escapa y convierte los saltos de línea en <br> (para mostrar el mensaje en el correo).
export function escapeHtmlWithBreaks(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}
