/** Alexa Smart Home は Lambda ARN が要る。結の /api/alexa へそのまま渡す。 */
export const handler = async (event) => {
  const url = process.env.YUI_ALEXA_URL || "https://yuihome.kitepon.dev/api/alexa/smart-home";
  if (!url) throw new Error("YUI_ALEXA_URL が無い");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`結が ${res.status}: ${text}`);
  }
  return res.json();
};
