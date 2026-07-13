import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BookingManagePage, OnlineBookingPage } from "./OnlineBookingPage";
import { PatientPortalPage } from "./PatientPortalPage";
import "@fontsource/nunito-sans/latin-400.css";
import "@fontsource/nunito-sans/latin-600.css";
import "@fontsource/nunito-sans/latin-700.css";
import "@fontsource/nunito-sans/latin-800.css";
import "./styles.css";
import "./workflow.css";
import "./v14.css";
import "./v143.css";
import "./specialties.css";
import "./portal25.css";

const booking = window.location.pathname.match(/^\/agendar\/([^/]+)$/);
const bookingManage = window.location.pathname.match(/^\/agendar\/([^/]+)\/gerenciar\/([^/]+)$/);
const portal = window.location.pathname.match(/^\/portal\/([^/]+)$/);
const Root = bookingManage
  ? () => <BookingManagePage slug={bookingManage[1]!} token={bookingManage[2]!} />
  : booking
  ? () => <OnlineBookingPage slug={booking[1]!} />
  : portal
    ? () => <PatientPortalPage slug={portal[1]!} />
    : App;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
