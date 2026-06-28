import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import Card from "../components/Card";
import Button from "../components/Button";
import { fetchOpenEvents } from "../lib/store";

const pageStyle = {
  minHeight: "100vh",
  background: "#f5f6f8",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const headingStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "18px",
  fontWeight: 700,
  color: "#1d2939",
  margin: "0 0 8px 0",
};

const bodyStyle = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: "14px",
  color: "#667085",
  lineHeight: 1.5,
  margin: 0,
};

export default function Landing() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOpenEvents()
      .then(setEvents)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ display: "inline-block", marginBottom: 24 }}>
            <Logo variant="horizontal" />
          </div>
          <Card>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>😕</div>
            <h2 style={headingStyle}>Something went wrong</h2>
            <p style={bodyStyle}>
              We couldn't load the current event. Please try again in a moment.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (events === null) {
    return (
      <div style={pageStyle}>
        <p style={{ fontFamily: "'Outfit', sans-serif", color: "#667085" }}>
          Loading...
        </p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ display: "inline-block", marginBottom: 24 }}>
            <Logo variant="horizontal" />
          </div>
          <Card>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>🛠️</div>
            <h2 style={headingStyle}>Check-In Closed</h2>
            <p style={bodyStyle}>
              We are not accepting registrations right now. Please check back
              later or speak with a volunteer for assistance.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (events.length === 1) {
    return <Navigate to={`/checkin?event=${events[0].id}`} replace />;
  }

  return (
    <div style={pageStyle}>
      <div style={{ textAlign: "center", maxWidth: 420, width: "100%" }}>
        <div style={{ display: "inline-block", marginBottom: 24 }}>
          <Logo variant="horizontal" />
        </div>
        <Card>
          <h2 style={{ ...headingStyle, marginBottom: 4 }}>
            Choose your event
          </h2>
          <p style={{ ...bodyStyle, marginBottom: 16 }}>
            More than one Repair Cafe is happening right now. Select an event to
            register at.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {events.map((ev) => (
              <Button
                key={ev.id}
                variant="secondary"
                onClick={() => navigate(`/checkin?event=${ev.id}`)}
                style={{ textAlign: "left", padding: "14px 18px" }}
              >
                <div
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontWeight: 600,
                    fontSize: "15px",
                    color: "#1e3a6e",
                  }}
                >
                  {ev.name}
                </div>
                {ev.location && (
                  <div
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontWeight: 400,
                      fontSize: "13px",
                      color: "#667085",
                      marginTop: 2,
                    }}
                  >
                    {ev.location}
                  </div>
                )}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
