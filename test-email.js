const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function main() {
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_FROM, // sending to yourself as a test
      subject: "Test Email from Next.js Basar App",
      text: "If you receive this email, the SMTP configuration is working correctly!",
      html: "<p>If you receive this email, the SMTP configuration is working correctly!</p>",
    });

    console.log("Email sent successfully!");
    console.log("Message ID:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

main().catch(console.error);