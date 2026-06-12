const contactForm = document.querySelector("[data-contact-form]");
const contactStatus = document.querySelector("[data-contact-status]");
const contactAddress = "gregthedinosaur@gmail.com";

function formatMessage(data) {
  const fullName = [data.get("firstName"), data.get("lastName")]
    .filter(Boolean)
    .join(" ");

  return [
    `Name: ${fullName}`,
    `Email: ${data.get("email") || ""}`,
    `Project or question: ${data.get("topic") || ""}`,
    "",
    data.get("message") || "",
  ].join("\n");
}

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(contactForm);
    const subject = data.get("topic") || "Greg Does AI contact";
    // Build the mailto by hand: URL.searchParams form-encodes spaces as "+",
    // which mail clients render literally in the draft body.
    const query = [
      `subject=${encodeURIComponent(`Greg Does AI: ${subject}`)}`,
      `body=${encodeURIComponent(formatMessage(data))}`,
    ].join("&");

    window.location.href = `mailto:${contactAddress}?${query}`;

    if (contactStatus) {
      contactStatus.textContent =
        "Your email app should be opening. If it does not, email Greg directly at gregthedinosaur@gmail.com.";
    }
  });
}
