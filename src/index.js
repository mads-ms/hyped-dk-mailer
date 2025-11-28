import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const TO = "hello@hyped.dk";

// IMPORTANT: This must be an address on a domain you control
// and have configured in Cloudflare Email Routing.
const FROM = "no-reply@hyped.dk";
const FROM_NAME = "Hyped.dk Contact Worker";

export default {
  async fetch(request, env, ctx) {
    console.info({ message: "Worker received a request" });

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Parse body (JSON or form)
    let data = {};
    const contentType = request.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        data = await request.json();
      } else if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const form = await request.formData();
        for (const [k, v] of form.entries()) data[k] = v;
      } else if (contentType.includes("text/plain")) {
        // Parse text/plain format: name=value\nname2=value2
        const text = await request.text();
        const lines = text.split("\n");
        for (const line of lines) {
          const equalIndex = line.indexOf("=");
          if (equalIndex > 0) {
            const key = line.substring(0, equalIndex).trim();
            const value = line.substring(equalIndex + 1).trim();
            if (key) data[key] = value;
          }
        }
      } else {
        return new Response("Unsupported Content-Type", { status: 415 });
      }
    } catch (err) {
      return new Response("Bad Request: could not parse body", { status: 400 });
    }

    const subject = String(data.subject || "New POST to Hyped.dk");
    const name = String(data.name || "");
    const email = String(data.email || "");
    const message = String(data.message || data.body || "");

    if (!message.trim()) {
      return new Response("Bad Request: message/body is required", {
        status: 400
      });
    }

    const textBody = [
      "You received a new POST submission:",
      "",
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null,
      data.phone ? `Phone: ${data.phone}` : null,
      "",
      "Message:",
      message,
      "",
      "Raw payload:",
      JSON.stringify(data, null, 2)
    ]
      .filter(Boolean)
      .join("\n");

    // Build MIME email
    const msg = createMimeMessage();
    msg.setSender({ name: FROM_NAME, addr: FROM });
    msg.setRecipient(TO);
    msg.setSubject(subject);
    msg.addMessage({
      contentType: "text/plain",
      data: textBody
    });

    const emailMessage = new EmailMessage(FROM, TO, msg.asRaw());

    try {
      await env.MAIL.send(emailMessage); // MAIL = binding name
    } catch (err) {
      console.error("Email send failed:", err);
      return new Response(`Email send failed: ${err.message}`, {
        status: 500
      });
    }

    return new Response("OK: email sent", { status: 200 });
  }
};
