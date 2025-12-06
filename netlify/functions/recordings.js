// Netlify Function to list Zoom cloud recordings for a single meeting ID

exports.handler = async () => {

  // Helper to format Zoom timestamps nicely, e.g. "Dec 6, 2025, 3:40 PM"
  function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles" // change this if your Zoom timezone is different
  });
}


  try {
    const {
      ZOOM_ACCOUNT_ID,
      ZOOM_CLIENT_ID,
      ZOOM_CLIENT_SECRET,
      MEETING_ID
    } = process.env;

    if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET || !MEETING_ID) {
      return {
        statusCode: 500,
        body: "Missing env vars. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, MEETING_ID in Netlify."
      };
    }

    // 1) Get access token from Zoom (Server-to-Server OAuth)
    const basic = Buffer.from(
      `${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`
    ).toString("base64");

    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`
        }
      }
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Error getting Zoom token:", tokenRes.status, text);
      return { statusCode: 500, body: "Failed to get Zoom token." };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2) Fetch recordings for your user
    const userId = process.env.ZOOM_USER_ID || "me";

    const recRes = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/recordings?page_size=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!recRes.ok) {
      const text = await recRes.text();
      console.error("Error fetching recordings:", recRes.status, text);
      return { statusCode: 500, body: "Failed to fetch recordings from Zoom." };
    }

    const recData = await recRes.json();
    const meetings = recData.meetings || [];
    const meetingIdNumber = Number(MEETING_ID);

    const filtered = meetings.filter(m => m.id === meetingIdNumber);

    // 3) Build HTML
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>MCA Meeting Recordings</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; background: #f5f5f5; }
          h1 { margin-bottom: 0.5rem; }
          .subtitle { margin-bottom: 1.5rem; color: #555; }
          .meeting { background: #fff; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .date { font-weight: 600; margin-bottom: 0.25rem; }
          .topic { color: #777; margin-bottom: 0.5rem; }
          .file { margin-left: 1rem; margin-bottom: 0.25rem; }
          a { text-decoration: none; color: #2563eb; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>MCA Meeting Recordings</h1>
        <div class="subtitle">Meeting ID: ${MEETING_ID}</div>
    `;

    if (!filtered.length) {
      html += `<p>No recordings found yet for this meeting.</p>`;
    } else {
      filtered.forEach(meeting => {
        const startTime = formatDate(meeting.start_time);
        const topic = meeting.topic || "MCA Meeting";

        html += `<div class="meeting">
          <div class="date">${startTime}</div>
          <div class="topic">${topic}</div>
        `;

        (meeting.recording_files || []).forEach(file => {
          if (file.play_url) {
            const type = file.file_type || "Recording";
            const recStart = formatDate(file.recording_start);
            html += `<div class="file">
              • <a href="${file.play_url}" target="_blank" rel="noopener noreferrer">
                ${type} (${recStart})
              </a>
            </div>`;
          }
        });

        html += `</div>`;
      });
    }

    html += `</body></html>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html
    };
  } catch (err) {
    console.error("Unhandled error:", err);
    return { statusCode: 500, body: "Unexpected error loading recordings." };
  }
};
