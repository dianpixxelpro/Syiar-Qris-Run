import nodemailer from 'nodemailer';

async function testSMTP() {
  console.log("Testing SMTP...");
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'jasafunoutboundonline@gmail.com',
      pass: 'ppohmijziabcmwfs'
    }
  });

  try {
    await transporter.verify();
    console.log("SMTP Config is correct and verified successfully.");
  } catch (error) {
    console.error("SMTP Error:", error);
  }
}

testSMTP();
