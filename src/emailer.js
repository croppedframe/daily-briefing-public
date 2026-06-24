import nodemailer from "nodemailer";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientSmtpError(error) {
  return Number(error?.responseCode) >= 400 && Number(error?.responseCode) < 500;
}

export async function sendEmail(config, message) {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user || config.pass ? {
      user: config.user,
      pass: config.pass,
    } : undefined,
  });

  const mail = {
    from: config.from,
    to: config.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    priority: "high",
    headers: {
      Importance: "high",
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
    },
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await transporter.sendMail(mail);
    } catch (error) {
      if (!isTransientSmtpError(error) || attempt === maxAttempts) throw error;

      const delayMs = attempt * 15000;
      console.warn(`SMTP transient error (${error.responseCode}); retrying email send in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw new Error("Email send failed.");
}
