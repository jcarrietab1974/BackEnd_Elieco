// Formato único de respuestas JSON.
//   Éxito: { success: true,  code, message }
//   Error: { success: false, code, message, errors?: [{ field, message }] }
export function ok(res, code, message, status = 200) {
  return res.status(status).json({ success: true, code, message });
}

export function fail(res, status, code, message, errors) {
  const body = { success: false, code, message };
  if (errors?.length) body.errors = errors;
  return res.status(status).json(body);
}
