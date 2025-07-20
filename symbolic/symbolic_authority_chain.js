const chain = ["root", "guardian", "system", "user"]; export function authorize(role) { const index = chain.indexOf(role); return index >= 0; }
