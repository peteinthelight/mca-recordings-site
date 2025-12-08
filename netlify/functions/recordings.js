// Netlify Function to list Zoom cloud recordings for a single meeting ID

exports.handler = async () => {

  // Helper to format Zoom timestamps nicely
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
      timeZone: "America/Mexico_City"   // match your Zoom account timezone
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
      `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/recordings?page_size=200`,
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>MCA Meeting Zoom Recordings</title>
        <style>
          :root {
            color-scheme: light;
          }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            padding: 0;
            background: #2a28cb;
          }
          .page {
            max-width: 720px;
            margin: 0 auto;
            padding: 2rem 1.5rem;
          }
          h1 {
            margin: 0 0 0.5rem 0;
            font-size: 1.8rem;
            color: #fff;
          }
          .subtitle {
            color: #fff;
            font-size: 0.95rem;
          }
          .meeting {
            background: #ffffffc7;
            border-radius: 10px;
            padding: 1rem 1.25rem;
            margin-bottom: 1rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid rgb(255 255 255);
          }
          .date {
            font-weight: 600;
            margin-bottom: 0.5rem;
            font-size: 1rem;
          }
          .file {
            margin-left: 0.75rem;
            margin-bottom: 0.25rem;
            font-size: 0.95rem;
            line-height: 1.4;
            font-weight: 500;
          }
          a {
            text-decoration: none;
            color: #0a44c4;
          }
          a:hover {
            text-decoration: underline;
          }
          .refresh {
          text-align: right;
          margin-bottom: 1.4rem;
          }
          .refresh a {
          color: #fff;
          font-size: 0.9rem;
          text-decoration: underline;
          }


          /* Mobile tweaks */
          @media (max-width: 600px) {
            .page {
              padding: 1.25rem 1rem;
            }
            h1 {
              font-size: 1.4rem;
            }
            .subtitle {
              font-size: 0.9rem;
            }
            .meeting {
              padding: 0.85rem 0.9rem;
            }
            .date {
              font-size: 1.1rem;
            }
            .file {
              font-size: 1rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <h1>MCA Meeting Zoom Recordings</h1>
          <div class="subtitle">Meeting ID: ${MEETING_ID}</div>
          <div class="refresh"><a href=""><span style="font-size: 1rem;">↻</span> Refresh</a></div>

    `;

    if (!filtered.length) {
      html += `<p>No recordings found yet for this meeting.</p>`;
    } else {
      filtered.forEach(meeting => {
        const startTime = formatDate(meeting.start_time);

        html += `<div class="meeting">
          <div class="date">${startTime}</div>
        `;

        // Filter out SUMMARY and CHAT files
        let files = (meeting.recording_files || []).filter(file => {
          return file.file_type !== "SUMMARY" && file.file_type !== "CHAT";
        });

        // Sort: VIDEO (MP4) first, AUDIO (M4A) second
        files.sort((a, b) => {
          const order = { MP4: 1, M4A: 2 };
          return (order[a.file_type] || 99) - (order[b.file_type] || 99);
        });

        // Display VIDEO and AUDIO labels (no timestamps here)
        files.forEach(file => {
          if (file.play_url) {
            let label = file.file_type;
            if (label === "MP4") label = "VIDEO";
            if (label === "M4A") label = "AUDIO";

            html += `<div class="file">
              • <a href="${file.play_url}" target="_blank" rel="noopener noreferrer">
                ${label}
              </a>
            </div>`;
          }
        });

        html += `</div>`;
      });
    }

    html += `
        </div>
      </body>
      </html>
    `;

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
