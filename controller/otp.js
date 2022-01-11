const db = require("../model");

const OTP = db.otp;
const router = require("express").Router();
const { encode,decode } = require("../middleware/crypt");
var otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");

var dates = {
  convert: function (d) {
    // Converts the date in d to a date-object. The input can be:
    //   a date object: returned without modification
    //  an array      : Interpreted as [year,month,day]. NOTE: month is 0-11.
    //   a number     : Interpreted as number of milliseconds
    //                  since 1 Jan 1970 (a timestamp)
    //   a string     : Any format supported by the javascript engine, like
    //                  "YYYY/MM/DD", "MM/DD/YYYY", "Jan 31 2009" etc.
    //  an object     : Interpreted as an object with year, month and date
    //                  attributes.  **NOTE** month is 0-11.
    return d.constructor === Date
      ? d
      : d.constructor === Array
      ? new Date(d[0], d[1], d[2])
      : d.constructor === Number
      ? new Date(d)
      : d.constructor === String
      ? new Date(d)
      : typeof d === "object"
      ? new Date(d.year, d.month, d.date)
      : NaN;
  },
  compare: function (a, b) {
    // Compare two dates (could be of any type supported by the convert
    // function above) and returns:
    //  -1 : if a < b
    //   0 : if a = b
    //   1 : if a > b
    // NaN : if a or b is an illegal date
    // NOTE: The code inside isFinite does an assignment (=).
    return isFinite((a = this.convert(a).valueOf())) &&
      isFinite((b = this.convert(b).valueOf()))
      ? (a > b) - (a < b)
      : NaN;
  },
  inRange: function (d, start, end) {
    // Checks if date in d is between dates in start and end.
    // Returns a boolean or NaN:
    //    true  : if d is between start and end (inclusive)
    //    false : if d is before start or after end
    //    NaN   : if one or more of the dates is illegal.
    // NOTE: The code inside isFinite does an assignment (=).
    return isFinite((d = this.convert(d).valueOf())) &&
      isFinite((start = this.convert(start).valueOf())) &&
      isFinite((end = this.convert(end).valueOf()))
      ? start <= d && d <= end
      : NaN;
  },
};

function AddMinutesToDate(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

module.exports.send_email = async (req, res, next) => {
  try {
    const { email, type } = req.body;
    let email_subject, email_message;
    if (!email) {
      const response = { Status: "Failure", Details: "Email not provided" };
      return res.status(400).send(response);
    }
    if (!type) {
      const response = { Status: "Failure", Details: "Type not provided" };
      return res.status(400).send(response);
    }

    //Generate OTP
    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    const now = new Date();
    const expiration_time = AddMinutesToDate(now, 10);

    //Create OTP instance in DB
    const otp_instance = await OTP.create({
      otp: otp,
      expiration_time: expiration_time,
    });

    // Create details object containing the email and otp id
    var details = {
      timestamp: now,
      check: email,
      success: true,
      message: "OTP sent to user",
      otp_id: otp_instance.id,
    };

    // Encrypt the details object
    const encoded = await encode(JSON.stringify(details));

    //Choose message template according type requestedconst encoded= await encode(JSON.stringify(details))
    if (type) {
      if (type == "VERIFICATION") {
        const {
          message,
          subject_mail,
        } = require("../templates/email/email_verification");
        email_message = message(otp);
        email_subject = subject_mail;
      } else if (type == "FORGET") {
        const {
          message,
          subject_mail,
        } = require("../templates/email/email_forget");
        email_message = message(otp);
        email_subject = subject_mail;
      } else if (type == "2FA") {
        const {
          message,
          subject_mail,
        } = require("../templates/email/email_2FA");
        email_message = message(otp);
        email_subject = subject_mail;
      } else {
        const response = {
          Status: "Failure",
          Details: "Incorrect Type Provided",
        };
        return res.status(400).send(response);
      }
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: `${process.env.EMAIL_ADDRESS}`,
        pass: `${process.env.EMAIL_PASSWORD}`,
      },
    });

    const mailOptions = {
      from: `"sinchan"<${process.env.EMAIL_ADDRESS}>`,
      to: `${email}`,
      subject: email_subject,
      text: email_message,
      replyTo: "noreply@gmail.com",
    };

    await transporter.verify();

    //Send Email
    await transporter.sendMail(mailOptions, (err, response) => {
      if (err) {
        return res.status(400).send({ Status: "Failure", Details: err });
      } else {
        // console.log('here is the res: ', response);
        return res.send({ Status: "Success", Details: encoded });
      }
    });
  } catch (err) {
    const response = { Status: "Failure", Details: err.message };
    return res.status(400).send(response);
  }
};

module.exports.send_phone = async (req, res, next) => {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      const response = {
        Status: "Failure",
        Details: "OTP for phone is not available right now",
      };
      return res.status(503).send(response);
    }

    const { phone_number, type } = req.body;

    let phone_message;

    if (!phone_number) {
      const response = {
        Status: "Failure",
        Details: "Phone Number not provided",
      };
      return res.status(400).send(response);
    }
    if (!type) {
      const response = { Status: "Failure", Details: "Type not provided" };
      return res.status(400).send(response);
    }

    //Generate OTP
    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    const now = new Date();
    const expiration_time = AddMinutesToDate(now, 10);

    //Create OTP instance in DB
    const otp_instance = await OTP.create({
      otp: otp,
      expiration_time: expiration_time,
    });

    // Create details object containing the phone number and otp id
    var details = {
      timestamp: now,
      check: phone_number,
      success: true,
      message: "OTP sent to user",
      otp_id: otp_instance.id,
    };

    // Encrypt the details object
    const encoded = await encode(JSON.stringify(details));

    //Choose message template according type requested
    if (type) {
      if (type == "VERIFICATION") {
        const message = require("../templates/phone/phone_verification");
        phone_message = message(otp);
      } else if (type == "FORGET") {
        const message = require("../templates/phone/phone_forget");
        phone_message = message(otp);
      } else if (type == "2FA") {
        const message = require("../templates/phone/phone_2FA");
        phone_message = message(otp);
      } else {
        const response = {
          Status: "Failure",
          Details: "Incorrect Type Provided",
        };
        return res.status(400).send(response);
      }
    }

    // Settings Params for SMS
    var params = {
      Message: phone_message,
      PhoneNumber: phone_number,
    };

    //Send the params to AWS SNS using aws-sdk
    var publishTextPromise = new AWS.SNS({ apiVersion: "2010-03-31" })
      .publish(params)
      .promise();

    //Send response back to the client if the message is sent
    publishTextPromise
      .then(function (data) {
        return res.send({ Status: "Success", Details: encoded });
      })
      .catch(function (err) {
        return res.status(400).send({ Status: "Failure", Details: err });
      });
  } catch (err) {
    const response = { Status: "Failure", Details: err.message };
    return res.status(400).send(response);
  }
};

module.exports.verify = async (req, res, next) => {
  try {
    var currentdate = new Date();
    const { verification_key, otp, check } = req.body;

    if (!verification_key) {
      const response = {
        Status: "Failure",
        Details: "Verification Key not provided",
      };
      return res.status(400).send(response);
    }
    if (!otp) {
      const response = { Status: "Failure", Details: "OTP not Provided" };
      return res.status(400).send(response);
    }
    if (!check) {
      const response = { Status: "Failure", Details: "Check not Provided" };
      return res.status(400).send(response);
    }

    let decoded;

    try {
      decoded = await decode(verification_key);
    } catch (err) {
      const response = { Status: "Failure", Details: "Bad Request" };
      return res.status(400).send(response);
    }

    var obj = JSON.parse(decoded);
    const check_obj = obj.check;

    // Check if the OTP was meant for the same email or phone number for which it is being verified
    if (check_obj != check) {
      const response = {
        Status: "Failure",
        Details: "OTP was not sent to this particular email or phone number",
      };
      return res.status(400).send(response);
    }

    const otp_instance = await OTP.findOne({ where: { id: obj.otp_id } });

    //Check if OTP is available in the DB
    if (otp_instance != null) {
      //Check if OTP is already used or not
      if (otp_instance.verified != true) {
        //Check if OTP is expired or not
        if (dates.compare(otp_instance.expiration_time, currentdate) == 1) {
          //Check if OTP is equal to the OTP in the DB
          if (otp === otp_instance.otp) {
            otp_instance.verified = true;
            otp_instance.save();
            const response = {
              Status: "Success",
              Details: "OTP Matched",
              Check: check,
            };
            return res.status(200).send(response);
          } else {
            const response = { Status: "Failure", Details: "OTP NOT Matched" };
            return res.status(400).send(response);
          }
        } else {
          const response = { Status: "Failure", Details: "OTP Expired" };
          return res.status(400).send(response);
        }
      } else {
        const response = { Status: "Failure", Details: "OTP Already Used" };
        return res.status(400).send(response);
      }
    } else {
      const response = { Status: "Failure", Details: "Bad Request" };
      return res.status(400).send(response);
    }
  } catch (err) {
    const response = { Status: "Failure", Details: err.message };
    return res.status(400).send(response);
  }
};
