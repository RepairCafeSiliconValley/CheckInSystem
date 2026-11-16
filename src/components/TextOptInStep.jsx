import { useState } from "react";
import Logo from "./Logo";
import Button from "./Button";
import Input from "./Input";
import Checkbox from "./Checkbox";

// The check-in step between the form and the waiver, shown only when the event
// collects phone numbers. It exists so a visitor reads *why* we want their
// number before typing it: on the main form, people entered a number and missed
// the consent box, so they never got the "your turn" text.
//
// The number and the consent go together here. Continue needs both; the only
// other way on is "No thanks", which keeps neither. The checkbox must never be
// pre-ticked (SMS consent has to be an active choice), and its wording is the
// approved consent text, so don't reword it casually.

const PHONE_REGEX = /^\d{10}$/;

function formatPhone(digits) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

const bodyStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#475467",
  lineHeight: 1.5,
  margin: "0 0 12px 0",
};

export default function TextOptInStep({
  initialPhone = "",
  initialOptIn = false,
  onContinue,
  onBack,
}) {
  const [phone, setPhone] = useState(
    formatPhone(initialPhone.replace(/\D/g, "")),
  );
  const [optIn, setOptIn] = useState(initialOptIn);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = PHONE_REGEX.test(digits);
  const showPhoneError = phoneTouched && !!digits && !phoneValid;
  const canContinue = phoneValid && optIn;

  const handlePhoneChange = (val) => {
    setPhone(formatPhone(val.replace(/\D/g, "").slice(0, 10)));
  };

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-block" }}>
          <Logo size="small" variant="horizontal" />
        </div>
      </div>

      <div style={{ fontSize: "32px", marginBottom: 8 }} aria-hidden="true">
        📱
      </div>
      <h2
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: "20px",
          fontWeight: 700,
          color: "#1d2939",
          margin: "0 0 8px 0",
        }}
      >
        Get a text when it's your turn
      </h2>
      <p style={bodyStyle}>
        When a volunteer is available to work with you, we can send you a
        text, so you don't have to keep listening for your name.
      </p>
      <p style={{ ...bodyStyle, margin: "0 0 20px 0" }}>
        It's optional. If you'd rather not, tap <strong>No Thanks</strong>.
        We'll still help you with your repair.
      </p>

      <Input
        label="Cell Phone"
        value={phone}
        onChange={handlePhoneChange}
        onBlur={() => setPhoneTouched(true)}
        placeholder="408-555-0101"
        type="tel"
        inputMode="numeric"
        maxLength={12}
      />
      {showPhoneError && (
        <div
          style={{
            padding: "8px 12px",
            background: "#fef3f2",
            borderRadius: "8px",
            marginTop: -8,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "13px",
              color: "#b42318",
            }}
          >
            Please enter a valid 10-digit phone number, or tap No thanks.
          </span>
        </div>
      )}
      <Checkbox
        checked={optIn}
        disabled={!phoneValid}
        onChange={setOptIn}
        style={{ marginBottom: 20 }}
      >
        <span
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "12px",
            fontWeight: 300,
            color: "#1d2939",
            lineHeight: 1.4,
          }}
        >
          By providing your mobile number and selecting this checkbox, you
          agree to receive text messages. Message frequency varies. Message
          and data rates may apply. Consent is not required to attend an
          event or receive repair assistance. Reply STOP to unsubscribe or
          HELP for assistance.
        </span>
      </Checkbox>

      <Button
        onClick={() => onContinue({ phone: digits, textMessageOptIn: true })}
        disabled={!canContinue}
      >
        Text me when it's my turn
      </Button>
      <div style={{ marginTop: 8 }}>
        <Button
          variant="ghost"
          onClick={() => onContinue({ phone: "", textMessageOptIn: false })}
        >
          No thanks, skip
        </Button>
      </div>

      <div style={{ textAlign: "center", marginTop: 4 }}>
        <button
          onClick={() => onBack({ phone: digits, textMessageOptIn: optIn })}
          style={{
            background: "none",
            border: "none",
            fontFamily: "'Outfit', sans-serif",
            fontSize: "14px",
            color: "#667085",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ← Back to form
        </button>
      </div>
    </div>
  );
}
