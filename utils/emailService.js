// Email service for sending notifications
// Uses Gmail SMTP (can be configured for other providers)

const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail SMTP
// You'll need to set these in your .env file:
// EMAIL_USER=your-email@gmail.com
// EMAIL_PASSWORD=your-app-password (not regular password, need to generate App Password in Google Account)
const createTransporter = () => {
  const emailUser = process.env.EMAIL_USER || 'yumnahammad4884@gmail.com';
  const emailPass = process.env.EMAIL_PASSWORD;

  if (!emailPass) {
    console.warn('⚠️ EMAIL_PASSWORD not set. Email notifications will not work.');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });
};

// Send registration notification email
const sendRegistrationNotification = async (registrationData) => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log('Email service not configured. Skipping email notification.');
      return false;
    }

    const notificationEmail = 'yumnahammad4884@gmail.com';
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'yumnahammad4884@gmail.com',
      to: notificationEmail,
      subject: 'New User Registration Attempt - Inventory Management System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #4F46E5; padding-bottom: 10px;">
            New User Registration Attempt
          </h2>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1f2937; margin-top: 0;">Registration Details:</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">First Name:</td>
                <td style="padding: 8px; color: #111827;">${registrationData.firstName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">Last Name:</td>
                <td style="padding: 8px; color: #111827;">${registrationData.lastName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">Email:</td>
                <td style="padding: 8px; color: #111827;">${registrationData.email || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">Role:</td>
                <td style="padding: 8px; color: #111827;">${registrationData.role || 'agent'}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">Registration Time:</td>
                <td style="padding: 8px; color: #111827;">${new Date().toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold; color: #374151;">IP Address:</td>
                <td style="padding: 8px; color: #111827;">${registrationData.ipAddress || 'N/A'}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-top: 20px;">
            <p style="margin: 0; color: #1e40af;">
              <strong>Status:</strong> ${registrationData.allowed ? '✅ Registration Approved' : '❌ Registration Blocked (Email not authorized)'}
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated notification from your Inventory Management System.
          </p>
        </div>
      `,
      text: `
New User Registration Attempt

Registration Details:
- First Name: ${registrationData.firstName || 'N/A'}
- Last Name: ${registrationData.lastName || 'N/A'}
- Email: ${registrationData.email || 'N/A'}
- Role: ${registrationData.role || 'agent'}
- Registration Time: ${new Date().toLocaleString()}
- IP Address: ${registrationData.ipAddress || 'N/A'}

Status: ${registrationData.allowed ? 'Registration Approved' : 'Registration Blocked (Email not authorized)'}
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Registration notification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending registration notification email:', error);
    // Don't throw error - email failure shouldn't block registration
    return false;
  }
};

module.exports = {
  sendRegistrationNotification,
  createTransporter
};

