/**
 * ==============================================================================
 * RFID-BASED ATTENDANCE SYSTEM - COMPUTER NETWORKS PBL
 * Pure Vanilla JavaScript (script.js)
 * 
 * Features:
 *  - Persistent Attendance History stored in browser localStorage
 *  - Table Display: Student Name, RFID ID, Date, Time, Status
 *  - Duplicate Attendance Prevention for the same student on the same day
 *  - Clear Records Button with native browser Confirmation Dialog
 *  - Search Field for filtering Attendance History
 *  - Three Sample Students shared across Table, Scanner, and Validation
 *  - Web Audio API buzzer sound chime for physical reader emulation
 * ==============================================================================
 */

// ==========================================
// 1. Initial Students Database
// ==========================================
const INITIAL_STUDENTS = [
  {
    studentId: "STU001",
    name: "Aarav Patel",
    dept: "Computer Science",
    rfidId: "STU1001",
    status: "ABSENT",
    date: "--",
    timestamp: "--"
  },
  {
    studentId: "STU002",
    name: "Sneha Sharma",
    dept: "Information Technology",
    rfidId: "STU1002",
    status: "PRESENT",
    date: new Date().toLocaleDateString('en-GB'),
    timestamp: "08:45:30 AM"
  },
  {
    studentId: "STU003",
    name: "Rohan Verma",
    dept: "Electronics & Communication",
    rfidId: "STU1003",
    status: "ABSENT",
    date: "--",
    timestamp: "--"
  }
];

// App State
let students = [];
let attendanceHistory = [];
let packetCount = 28;
let soundEnabled = true;

// ==========================================
// 2. Audio Synthesizer (Web Audio API)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playRfidBeep(type = "success") {
  if (!soundEnabled) return;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(2400, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.17);
    } else if (type === "warning") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(950, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.26);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(280, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.36);
    }
  } catch (err) {
    console.warn("Audio unavailable:", err);
  }
}

// ==========================================
// 3. LocalStorage Persistence
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  loadAttendanceHistory();
  setupEventListeners();
  startLiveClock();
  renderAll();
  logNetworkMessage("[SYSTEM READY] Attendance history loaded from localStorage. Gateway active.");
});

function loadData() {
  const saved = localStorage.getItem("rfid_attendance_students");
  if (saved) {
    try {
      students = JSON.parse(saved);
      if (!students.some(s => s.studentId === "STU001")) {
        students = [...INITIAL_STUDENTS];
      }
    } catch (e) {
      students = [...INITIAL_STUDENTS];
    }
  } else {
    students = [...INITIAL_STUDENTS];
  }
  saveData();
}

function saveData() {
  localStorage.setItem("rfid_attendance_students", JSON.stringify(students));
}

/**
 * Loads attendance history from browser localStorage
 */
function loadAttendanceHistory() {
  const saved = localStorage.getItem("rfid_attendance_history");
  if (saved) {
    try {
      attendanceHistory = JSON.parse(saved);
    } catch (e) {
      attendanceHistory = [];
    }
  } else {
    // Seed with initial record for Sneha Sharma (STU1002)
    const today = new Date().toLocaleDateString('en-GB');
    attendanceHistory = [
      {
        id: 1,
        name: "Sneha Sharma",
        rfidId: "STU1002",
        date: today,
        time: "08:45:30 AM",
        status: "Present"
      }
    ];
    saveAttendanceHistory();
  }
}

/**
 * Saves attendance history to browser localStorage
 */
function saveAttendanceHistory() {
  localStorage.setItem("rfid_attendance_history", JSON.stringify(attendanceHistory));
}

// ==========================================
// 4. Live Clock & Dashboard Stats
// ==========================================
function startLiveClock() {
  const clockEl = document.getElementById("clock-display");
  function update() {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  update();
  setInterval(update, 1000);
}

function updateDashboardMetrics() {
  const total = students.length;
  const today = new Date().toLocaleDateString('en-GB');
  
  // Count distinct students present today
  const presentStudents = students.filter(s => 
    attendanceHistory.some(rec => rec.rfidId === s.rfidId && rec.date === today)
  );
  const presentCount = presentStudents.length;
  const absentCount = total - presentCount;
  const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  document.getElementById("total-students-count").textContent = total;
  document.getElementById("present-count").textContent = presentCount;
  document.getElementById("absent-count").textContent = absentCount;
  document.getElementById("attendance-rate").textContent = `${rate}%`;
  document.getElementById("rate-bar").style.width = `${rate}%`;
  document.getElementById("packet-count").textContent = packetCount;
}

// ==========================================
// 5. Attendance History Table Rendering & Search
// ==========================================
/**
 * Renders the Attendance History Table:
 * Displays Student Name, RFID ID, Date, Time, and Status
 */
function renderHistoryTable() {
  const tbody = document.getElementById("history-tbody");
  if (!tbody) return;

  const searchVal = (document.getElementById("search-history-input")?.value || "").toLowerCase().trim();
  const emptyState = document.getElementById("history-empty-state");
  const summaryEl = document.getElementById("history-table-summary");

  tbody.innerHTML = "";

  // Filter history by student name, RFID ID, date, or status
  const filtered = attendanceHistory.filter(record => {
    return (
      record.name.toLowerCase().includes(searchVal) ||
      record.rfidId.toLowerCase().includes(searchVal) ||
      record.date.toLowerCase().includes(searchVal) ||
      record.time.toLowerCase().includes(searchVal) ||
      record.status.toLowerCase().includes(searchVal)
    );
  });

  if (emptyState) {
    emptyState.style.display = filtered.length === 0 ? "block" : "none";
  }

  if (summaryEl) {
    summaryEl.textContent = `Showing ${filtered.length} of ${attendanceHistory.length} attendance records`;
  }

  filtered.forEach(record => {
    const tr = document.createElement("tr");
    const initials = record.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();

    tr.innerHTML = `
      <td>
        <div class="student-cell">
          <div class="student-avatar">${initials}</div>
          <div class="student-info">
            <span class="student-name"><strong>${escapeHTML(record.name)}</strong></span>
          </div>
        </div>
      </td>
      <td>
        <span class="uid-chip"><i class="fa-solid fa-barcode"></i> ${escapeHTML(record.rfidId)}</span>
      </td>
      <td>
        <span class="text-secondary"><i class="fa-regular fa-calendar"></i> ${escapeHTML(record.date)}</span>
      </td>
      <td>
        <span class="text-secondary"><i class="fa-regular fa-clock"></i> ${escapeHTML(record.time)}</span>
      </td>
      <td>
        <span class="status-pill present">
          <span class="pill-dot"></span>
          ${escapeHTML(record.status)}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 6. Student Details Table Rendering
// ==========================================
function renderStudentsTable() {
  const tbody = document.getElementById("students-tbody");
  if (!tbody) return;

  const searchVal = (document.getElementById("student-search-input")?.value || "").toLowerCase().trim();
  const emptyState = document.getElementById("students-empty-state");
  const summaryEl = document.getElementById("students-table-summary");
  const today = new Date().toLocaleDateString('en-GB');

  tbody.innerHTML = "";

  const filtered = students.filter(s => {
    return (
      s.studentId.toLowerCase().includes(searchVal) ||
      s.name.toLowerCase().includes(searchVal) ||
      s.dept.toLowerCase().includes(searchVal) ||
      s.rfidId.toLowerCase().includes(searchVal)
    );
  });

  if (emptyState) emptyState.style.display = filtered.length === 0 ? "block" : "none";
  if (summaryEl) summaryEl.textContent = `Showing ${filtered.length} of ${students.length} students`;

  filtered.forEach(student => {
    const tr = document.createElement("tr");
    const initials = student.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    
    // Check if recorded today in attendance history
    const historyEntry = attendanceHistory.find(rec => rec.rfidId === student.rfidId && rec.date === today);
    const isPresent = !!historyEntry || student.status === "PRESENT";
    const timeDisplay = historyEntry ? historyEntry.time : student.timestamp;

    tr.innerHTML = `
      <td>
        <span class="roll-badge"><strong>${escapeHTML(student.studentId)}</strong></span>
      </td>
      <td>
        <div class="student-cell">
          <div class="student-avatar">${initials}</div>
          <div class="student-info">
            <span class="student-name">${escapeHTML(student.name)}</span>
          </div>
        </div>
      </td>
      <td>
        <strong>${escapeHTML(student.dept)}</strong>
      </td>
      <td>
        <span class="uid-chip" title="Click to Simulate RFID Scan" onclick="simulateScanInput('${student.rfidId}')" style="cursor: pointer;">
          <i class="fa-solid fa-barcode"></i> ${escapeHTML(student.rfidId)}
        </span>
      </td>
      <td>
        <span class="status-pill ${isPresent ? 'present' : 'absent'}">
          <span class="pill-dot"></span>
          ${isPresent ? 'Present (' + timeDisplay + ')' : 'Absent'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="simulateScanInput('${student.rfidId}')" title="Scan ${student.name}'s Card">
          <i class="fa-solid fa-wifi"></i> Scan Card
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 7. RFID Scanning Simulation with Duplicate Prevention
// ==========================================
/**
 * Scans RFID ID:
 * 1. Validates ID
 * 2. Checks if student was ALREADY recorded on the SAME DAY
 * 3. Saves to browser localStorage
 */
function scanRfid(rawInput) {
  if (!rawInput || !rawInput.trim()) {
    showToast("Input Required", "Please enter an RFID ID such as STU1001.", "warning");
    return;
  }

  const query = rawInput.trim().toUpperCase();
  const readerHardware = document.getElementById("rfid-hardware");
  const readerInstruction = document.getElementById("reader-instruction");
  const statusLed = document.getElementById("device-led");
  const liveTagBadge = document.getElementById("live-packet-tag");

  if (readerHardware) readerHardware.classList.add("active-scan");
  if (readerInstruction) readerInstruction.textContent = `Scanning: ID [${query}]...`;
  if (liveTagBadge) {
    liveTagBadge.textContent = "TRANSMITTING...";
    liveTagBadge.style.color = "#38bdf8";
  }

  simulateNetworkStep(1);
  setTimeout(() => simulateNetworkStep(2), 150);
  setTimeout(() => simulateNetworkStep(3), 300);
  setTimeout(() => simulateNetworkStep(4), 500);

  setTimeout(() => {
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB'); // e.g. 15/10/2026
    const currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Find student in database
    const student = students.find(s => 
      s.rfidId.toUpperCase() === query ||
      s.studentId.toUpperCase() === query ||
      s.name.toUpperCase() === query
    );

    packetCount += 4;
    document.getElementById("packet-count").textContent = packetCount;

    // CASE 1: INVALID RFID ID
    if (!student) {
      playRfidBeep("error");

      if (readerHardware) {
        readerHardware.classList.remove("active-scan");
        readerHardware.classList.add("scan-warn");
      }
      if (statusLed) statusLed.className = "device-status-led warn";
      if (readerInstruction) readerInstruction.textContent = "Invalid RFID ID";
      if (liveTagBadge) {
        liveTagBadge.textContent = "404 NOT FOUND";
        liveTagBadge.style.color = "#ef4444";
      }

      displayScanResult("invalid", { enteredId: query });
      logNetworkMessage(`[ERROR 404] Rejected: Invalid RFID ID "${query}".`);
      showToast("Invalid RFID ID", `No student found with RFID ID "${query}".`, "danger");

      setTimeout(resetScannerState, 3500);
      return;
    }

    // CASE 2: PREVENT DUPLICATE ATTENDANCE FOR SAME STUDENT ON SAME DAY
    const existingRecord = attendanceHistory.find(rec => 
      rec.rfidId.toUpperCase() === student.rfidId.toUpperCase() && rec.date === currentDate
    );

    if (existingRecord) {
      playRfidBeep("warning");

      if (readerHardware) {
        readerHardware.classList.remove("active-scan");
        readerHardware.classList.add("scan-warn");
      }
      if (statusLed) statusLed.className = "device-status-led warn";
      if (readerInstruction) readerInstruction.textContent = `Already Recorded: ${student.name}`;
      if (liveTagBadge) {
        liveTagBadge.textContent = "409 CONFLICT";
        liveTagBadge.style.color = "#f59e0b";
      }

      displayScanResult("duplicate", {
        student: student,
        date: existingRecord.date,
        time: existingRecord.time
      });

      logNetworkMessage(`[DUP 409 CONFLICT] Duplicate rejected: ${student.name} (${student.rfidId}) already recorded today at ${existingRecord.time}.`);
      showToast("Attendance Already Recorded", `${student.name} was already marked for today at ${existingRecord.time}.`, "warning");

      setTimeout(resetScannerState, 3500);
      return;
    }

    // CASE 3: VALID RFID ID & FIRST SCAN TODAY
    const newRecord = {
      id: Date.now(),
      name: student.name,
      rfidId: student.rfidId,
      date: currentDate,
      time: currentTime,
      status: "Present"
    };

    // Save into history (top of array) and persist to browser localStorage
    attendanceHistory.unshift(newRecord);
    saveAttendanceHistory();

    student.status = "PRESENT";
    student.date = currentDate;
    student.timestamp = currentTime;
    saveData();

    playRfidBeep("success");

    if (readerHardware) {
      readerHardware.classList.remove("active-scan");
      readerHardware.classList.add("scan-success");
    }
    if (statusLed) statusLed.className = "device-status-led success";
    if (readerInstruction) readerInstruction.textContent = `Verified: ${student.name}`;
    if (liveTagBadge) {
      liveTagBadge.textContent = "200 OK VERIFIED";
      liveTagBadge.style.color = "#10b981";
    }

    // Compute CRC-16 Checksum and simulated RSSI
    const crc16Val = calculateCRC16(student.rfidId);
    const simulatedRssi = (-(38 + Math.floor(Math.random() * 12))) + " dBm";

    displayScanResult("success", {
      student: student,
      date: currentDate,
      time: currentTime,
      crc16: crc16Val,
      rssi: simulatedRssi
    });

    logNetworkMessage(`[HTTP POST 200] Logged to localStorage: ${student.name} (${student.rfidId}) [CRC16: ${crc16Val}] at ${currentTime}.`);
    showToast("Attendance Marked Successfully", `Welcome, ${student.name}! Attendance saved to localStorage.`, "success");

    renderAll();
    setTimeout(resetScannerState, 3500);

  }, 650);
}

// CRC-16 (CCITT) Calculation Algorithm
function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return "0x" + crc.toString(16).toUpperCase().padStart(4, "0");
}

let lastInspectedData = null;

function displayScanResult(type, data) {
  const resultCards = [
    document.getElementById("scan-result-card"),
    document.getElementById("modal-scan-result-card")
  ];
  const placeholder = document.getElementById("result-placeholder");
  if (placeholder) placeholder.style.display = "none";

  let html = "";

  if (type === "success") {
    lastInspectedData = data;
    html = `
      <div class="result-status-badge status-success">
        <i class="fa-solid fa-circle-check"></i>
        <span>Attendance Marked Successfully</span>
      </div>
      <div class="result-details-grid">
        <div class="result-item">
          <span class="item-label">Student Name:</span>
          <strong class="item-val">${escapeHTML(data.student.name)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Department:</span>
          <strong class="item-val text-primary">${escapeHTML(data.student.dept)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Current Date:</span>
          <strong class="item-val">${escapeHTML(data.date)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Current Time:</span>
          <strong class="item-val">${escapeHTML(data.time)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">RFID ID &amp; CRC-16:</span>
          <span class="item-tag">${escapeHTML(data.student.rfidId)} &bull; <code>${data.crc16}</code></span>
        </div>
        <div class="result-item">
          <span class="item-label">Signal RSSI:</span>
          <span class="item-val text-success"><i class="fa-solid fa-satellite-dish"></i> ${data.rssi} (HF 13.56MHz)</span>
        </div>
        <div class="result-item full-width" style="margin-top: 0.35rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
          <span class="item-val text-success"><i class="fa-solid fa-cloud-arrow-down"></i> Saved in LocalStorage</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openPacketInspectorForCurrent()" style="font-size: 0.78rem;">
            <i class="fa-solid fa-layer-group text-primary"></i> Inspect OSI Packet (Wireshark)
          </button>
        </div>
      </div>
    `;
  } else if (type === "duplicate") {
    html = `
      <div class="result-status-badge status-warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Attendance Already Recorded</span>
      </div>
      <div class="result-details-grid">
        <div class="result-item">
          <span class="item-label">Student Name:</span>
          <strong class="item-val">${escapeHTML(data.student.name)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Department:</span>
          <strong class="item-val text-primary">${escapeHTML(data.student.dept)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Recorded Date:</span>
          <strong class="item-val">${escapeHTML(data.date)}</strong>
        </div>
        <div class="result-item">
          <span class="item-label">Recorded Time:</span>
          <strong class="item-val">${escapeHTML(data.time)}</strong>
        </div>
        <div class="result-item full-width">
          <span class="item-label">Duplicate Prevention:</span>
          <span class="item-val text-warning">This student has already been marked present for today (${escapeHTML(data.date)}). Duplicate scans are automatically blocked.</span>
        </div>
      </div>
    `;
  } else if (type === "invalid") {
    html = `
      <div class="result-status-badge status-danger">
        <i class="fa-solid fa-circle-xmark"></i>
        <span>Invalid RFID ID</span>
      </div>
      <div class="result-details-grid">
        <div class="result-item full-width">
          <span class="item-label">Scanned RFID ID:</span>
          <strong class="item-val text-danger">"${escapeHTML(data.enteredId)}"</strong>
        </div>
        <div class="result-item full-width">
          <span class="item-label">Error Details:</span>
          <span class="item-val text-muted">The entered RFID ID does not exist in the database. Please verify the ID or register a new student.</span>
        </div>
      </div>
    `;
  }

  resultCards.forEach(card => {
    if (card) {
      card.innerHTML = html;
      card.style.display = "flex";
    }
  });
}

function simulateScanInput(id) {
  const input = document.getElementById("rfid-id-input");
  if (input) input.value = id;

  const modalInput = document.getElementById("modal-rfid-input");
  if (modalInput) modalInput.value = id;

  scanRfid(id);
}

function handleScanButtonClick() {
  const input = document.getElementById("rfid-id-input");
  if (input) scanRfid(input.value);
}

// ==========================================
// 8. Clear Records with Confirmation Message
// ==========================================
/**
 * Clears all attendance records from localStorage after user confirmation
 */
function handleClearRecords() {
  const confirmed = confirm("Are you sure you want to clear all attendance records? This action cannot be undone.");
  if (!confirmed) return;

  // Clear attendance history array & localStorage
  attendanceHistory = [];
  localStorage.removeItem("rfid_attendance_history");

  // Reset student attendance statuses
  students.forEach(s => {
    s.status = "ABSENT";
    s.date = "--";
    s.timestamp = "--";
  });
  saveData();

  renderAll();

  // Reset reader display
  const placeholder = document.getElementById("result-placeholder");
  const resultCard = document.getElementById("scan-result-card");
  if (placeholder) placeholder.style.display = "flex";
  if (resultCard) resultCard.style.display = "none";

  logNetworkMessage("[CLEAR] All attendance history cleared from localStorage.");
  showToast("Records Cleared", "All attendance records have been cleared successfully.", "success");
}

// ==========================================
// 9. Export Attendance History to CSV
// ==========================================
function exportAttendanceCSV() {
  if (attendanceHistory.length === 0) {
    showToast("No Data", "No attendance records to export.", "warning");
    return;
  }

  let csv = "Student Name,RFID ID,Date,Time,Status\n";
  attendanceHistory.forEach(record => {
    csv += `"${record.name}","${record.rfidId}","${record.date}","${record.time}","${record.status}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  link.setAttribute("href", url);
  link.setAttribute("download", `RFID_Attendance_History_${today}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  logNetworkMessage(`[CSV EXPORT] Downloaded: RFID_Attendance_History_${today}.csv`);
  showToast("Export Successful", "Attendance History CSV downloaded.", "success");
}

function renderDemoChips() {
  const container = document.getElementById("demo-cards-list");
  const modalContainer = document.getElementById("modal-cards-list");

  const chipsHtml = `
    <button type="button" class="rfid-pill-btn" onclick="simulateScanInput('STU1001')">
      <strong>STU1001</strong> (Aarav - Absent)
    </button>
    <button type="button" class="rfid-pill-btn" onclick="simulateScanInput('STU1002')">
      <strong>STU1002</strong> (Sneha - Present Today)
    </button>
    <button type="button" class="rfid-pill-btn" onclick="simulateScanInput('STU1003')">
      <strong>STU1003</strong> (Rohan - Absent)
    </button>
    <button type="button" class="rfid-pill-btn pill-invalid" onclick="simulateScanInput('INVALID999')">
      <i class="fa-solid fa-triangle-exclamation"></i> <strong>INVALID999</strong> (Test Invalid)
    </button>
    <button type="button" class="rfid-pill-btn" onclick="simulateGateRushBurst()" style="background: #eef2ff; border-color: #a5b4fc; color: #4338ca;">
      <i class="fa-solid fa-bolt"></i> <strong>Gate Rush</strong> (Burst 3 Cards)
    </button>
  `;

  if (container) container.innerHTML = chipsHtml;
  if (modalContainer) modalContainer.innerHTML = chipsHtml;
}

function renderAll() {
  updateDashboardMetrics();
  renderHistoryTable();
  renderStudentsTable();
  renderDemoChips();
}

function simulateNetworkStep(stepNum) {
  const nodes = [
    document.getElementById("node-card"),
    document.getElementById("node-reader"),
    document.getElementById("node-router"),
    document.getElementById("node-server")
  ];
  const arrows = document.querySelectorAll(".flow-arrow");

  nodes.forEach((n, idx) => {
    if (n) {
      if (idx < stepNum) n.classList.add("active");
      else n.classList.remove("active");
    }
  });

  arrows.forEach((arr, idx) => {
    if (arr) {
      if (idx < stepNum - 1) arr.classList.add("active");
      else arr.classList.remove("active");
    }
  });
}

function resetScannerState() {
  const readerHardware = document.getElementById("rfid-hardware");
  const readerInstruction = document.getElementById("reader-instruction");
  const statusLed = document.getElementById("device-led");
  const liveTagBadge = document.getElementById("live-packet-tag");

  if (readerHardware) readerHardware.className = "rfid-device";
  if (statusLed) statusLed.className = "device-status-led";
  if (readerInstruction) readerInstruction.textContent = "Ready: Enter RFID ID (e.g. STU1001) & Click Scan";
  if (liveTagBadge) {
    liveTagBadge.textContent = "STANDBY";
    liveTagBadge.style.color = "#38bdf8";
  }

  document.querySelectorAll(".flow-node").forEach(n => n.classList.remove("active"));
  document.querySelectorAll(".flow-arrow").forEach(a => a.classList.remove("active"));
}

function logNetworkMessage(text) {
  const body = document.getElementById("packet-console-output");
  if (!body) return;

  const line = document.createElement("div");
  line.className = "console-line";

  if (text.includes("ERROR") || text.includes("404") || text.includes("Invalid")) {
    line.style.color = "#ef4444";
  } else if (text.includes("WARNING") || text.includes("409") || text.includes("DUP")) {
    line.style.color = "#f59e0b";
  } else if (text.includes("200") || text.includes("VERIFIED") || text.includes("Successfully")) {
    line.style.color = "#10b981";
  } else {
    line.style.color = "#93c5fd";
  }

  const timePrefix = new Date().toLocaleTimeString([], { hour12: false });
  line.textContent = `[${timePrefix}] ${text}`;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

// ==========================================
// 10. Add Student Form Handler
// ==========================================
function handleAddStudentSubmit() {
  const studentId = document.getElementById("new-student-id")?.value.trim().toUpperCase();
  const name = document.getElementById("new-student-name")?.value.trim();
  const dept = document.getElementById("new-student-dept")?.value;
  const rfidId = (document.getElementById("new-student-rfid")?.value || "").trim().toUpperCase();

  if (!studentId || !name || !dept || !rfidId) {
    showToast("Missing Fields", "Please complete all mandatory fields.", "warning");
    return;
  }

  if (students.some(s => s.studentId === studentId)) {
    showToast("Duplicate Student ID", `Student ID "${studentId}" already exists.`, "danger");
    return;
  }

  if (students.some(s => s.rfidId === rfidId)) {
    showToast("Duplicate RFID ID", `RFID ID "${rfidId}" is already assigned.`, "danger");
    return;
  }

  const newStudent = {
    studentId: studentId,
    name: name,
    dept: dept,
    rfidId: rfidId,
    status: "ABSENT",
    date: "--",
    timestamp: "--"
  };

  students.push(newStudent);
  saveData();
  renderAll();

  document.getElementById("add-student-form").reset();
  closeModal("add-student-modal");

  logNetworkMessage(`[REGISTERED] New student: ${name} (${studentId}) with RFID ID: ${rfidId}.`);
  showToast("Student Registered", `${name} added successfully.`, "success");
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}

function showToast(title, message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let iconHtml = '<i class="fa-solid fa-circle-check toast-icon"></i>';
  if (type === "warning") iconHtml = '<i class="fa-solid fa-triangle-exclamation toast-icon"></i>';
  if (type === "danger") iconHtml = '<i class="fa-solid fa-circle-xmark toast-icon"></i>';

  toast.innerHTML = `
    ${iconHtml}
    <div class="toast-content">
      <span class="toast-title">${escapeHTML(title)}</span>
      <span class="toast-msg">${escapeHTML(message)}</span>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 11. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Real-time search fields
  document.getElementById("search-history-input")?.addEventListener("input", renderHistoryTable);
  document.getElementById("student-search-input")?.addEventListener("input", renderStudentsTable);

  // Scan Button
  document.getElementById("scan-btn")?.addEventListener("click", handleScanButtonClick);

  // Clear Records Button with confirmation message
  document.getElementById("btn-clear-records")?.addEventListener("click", handleClearRecords);

  // Export to CSV
  document.getElementById("btn-export-csv")?.addEventListener("click", exportAttendanceCSV);

  // Modal Openers
  document.getElementById("open-scan-modal-btn")?.addEventListener("click", () => openModal("scan-modal"));
  document.getElementById("btn-open-add-student")?.addEventListener("click", () => openModal("add-student-modal"));
  document.getElementById("btn-add-student-dir")?.addEventListener("click", () => openModal("add-student-modal"));

  // Modal Closers
  document.getElementById("close-scan-modal")?.addEventListener("click", () => closeModal("scan-modal"));
  document.getElementById("close-add-modal")?.addEventListener("click", () => closeModal("add-student-modal"));
  document.getElementById("btn-cancel-add")?.addEventListener("click", () => closeModal("add-student-modal"));

  // Modal Scan
  document.getElementById("btn-modal-scan-submit")?.addEventListener("click", () => {
    const val = document.getElementById("modal-rfid-input")?.value;
    if (val) scanRfid(val);
  });

  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) e.target.classList.remove("open");
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.open").forEach(m => m.classList.remove("open"));
    }
  });

  // Clear Network Console
  document.getElementById("btn-clear-console")?.addEventListener("click", () => {
    const consoleBody = document.getElementById("packet-console-output");
    if (consoleBody) {
      consoleBody.innerHTML = '<div class="console-line text-muted">[CONSOLE CLEARED] Ready for new RFID scanning simulation events...</div>';
    }
  });

  // Sound Toggle
  const soundBtn = document.getElementById("toggle-sound-btn");
  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      if (soundEnabled) {
        soundBtn.innerHTML = '<i class="fa-solid fa-volume-high" id="sound-icon"></i> Audio Beep: ON';
        showToast("Audio Enabled", "Buzzer sound is active.", "success");
      } else {
        soundBtn.innerHTML = '<i class="fa-solid fa-volume-xmark" id="sound-icon"></i> Audio Beep: OFF';
        showToast("Audio Muted", "Buzzer sound is muted.", "warning");
      }
    });
  }

  // Network Diagnostics & Packet Inspector Listeners
  document.getElementById("btn-run-ping")?.addEventListener("click", handleRunPing);
  document.getElementById("btn-run-handshake")?.addEventListener("click", handleRunHandshake);
  document.getElementById("btn-open-packet-inspector")?.addEventListener("click", openPacketInspectorForCurrent);
  document.getElementById("close-inspector-modal")?.addEventListener("click", () => closeModal("packet-inspector-modal"));
}

// ==========================================
// 12. Advanced Computer Networks PBL Diagnostics & Packet Inspector
// ==========================================

function toggleLayer(layerBodyId) {
  const body = document.getElementById(layerBodyId);
  if (!body) return;
  const parent = body.closest(".dissector-layer");
  if (parent) parent.classList.toggle("collapsed");
}

function openPacketInspectorForCurrent() {
  if (lastInspectedData && lastInspectedData.student) {
    openPacketInspector(lastInspectedData);
  } else {
    // Default inspection for first sample student
    openPacketInspector({
      student: { name: "Aarav Patel", studentId: "STU001", rfidId: "STU1001", dept: "Computer Science" },
      date: new Date().toLocaleDateString('en-GB'),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      crc16: calculateCRC16("STU1001"),
      rssi: "-42 dBm"
    });
  }
}

function openPacketInspector(data) {
  const frameNumEl = document.getElementById("insp-frame-num");
  const timeEl = document.getElementById("insp-arrival-time");
  const crcEl = document.getElementById("insp-crc-val");
  const jsonEl = document.getElementById("insp-json-payload");

  if (frameNumEl) frameNumEl.textContent = `#${Math.floor(1000 + Math.random() * 9000)}`;
  if (timeEl) timeEl.textContent = `${data.date || 'Today'} ${data.time || 'Live'}`;
  if (crcEl) crcEl.textContent = `CRC-16: ${data.crc16 || '0xE8A2'} [Verified OK]`;

  if (jsonEl && data.student) {
    const payloadObj = {
      event: "RFID_CARD_DETECTED",
      nodeId: "RC522_LAN_GATE_01",
      studentName: data.student.name,
      studentId: data.student.studentId,
      rfidTag: data.student.rfidId,
      department: data.student.dept,
      crc16: data.crc16 || "0xE8A2",
      rssi: data.rssi || "-42 dBm",
      protocol: "TCP/IP HTTP/1.1 POST",
      targetSocket: "192.168.1.100:8080",
      timestamp: new Date().toISOString()
    };
    jsonEl.textContent = JSON.stringify(payloadObj, null, 2);
  }

  openModal("packet-inspector-modal");
}

/**
 * Simulates real ICMP Ping test across local subnet
 */
function handleRunPing() {
  const terminal = document.getElementById("diag-output-terminal");
  const badge = document.getElementById("diag-status-badge");
  const latencyBadge = document.getElementById("network-latency");

  if (!terminal) return;

  if (badge) {
    badge.textContent = "PINGING...";
    badge.style.color = "#38bdf8";
  }

  terminal.textContent = "Executing: ping 192.168.1.100 -c 4 (Standard 56-Byte ICMP Echo)...\n";

  const delays = [
    3.8 + Math.random() * 2.5,
    4.1 + Math.random() * 1.8,
    3.5 + Math.random() * 2.2,
    4.0 + Math.random() * 2.0
  ];

  delays.forEach((delay, idx) => {
    setTimeout(() => {
      const line = `64 bytes from 192.168.1.100: icmp_seq=${idx + 1} ttl=64 time=${delay.toFixed(2)} ms\n`;
      terminal.textContent += line;
      terminal.scrollTop = terminal.scrollHeight;
    }, (idx + 1) * 350);
  });

  setTimeout(() => {
    const min = Math.min(...delays).toFixed(2);
    const max = Math.max(...delays).toFixed(2);
    const avg = (delays.reduce((a, b) => a + b) / delays.length).toFixed(2);

    const stats = `\n--- 192.168.1.100 ping statistics ---\n4 packets transmitted, 4 packets received, 0.0% packet loss\nround-trip min/avg/max = ${min}/${avg}/${max} ms\nSocket status: 192.168.1.100:8080 reachable with optimal latency.`;
    terminal.textContent += stats;
    terminal.scrollTop = terminal.scrollHeight;

    if (badge) {
      badge.textContent = "0% LOSS (OK)";
      badge.style.color = "#10b981";
    }
    if (latencyBadge) {
      latencyBadge.textContent = `${avg} ms`;
    }

    logNetworkMessage(`[ICMP PING] 192.168.1.100 responded: 4/4 packets, avg RTT = ${avg} ms.`);
    showToast("Ping Completed", `Host 192.168.1.100 is ONLINE (Avg: ${avg} ms, 0% loss).`, "success");
  }, 1750);
}

/**
 * Simulates TCP 3-Way Handshake step-by-step
 */
function handleRunHandshake() {
  const terminal = document.getElementById("diag-output-terminal");
  const badge = document.getElementById("diag-status-badge");
  if (!terminal) return;

  if (badge) {
    badge.textContent = "HANDSHAKE...";
    badge.style.color = "#f59e0b";
  }

  terminal.textContent = "[TCP 3-WAY HANDSHAKE INITIATION]\nClient: 192.168.1.50:49152  <===>  Server: 192.168.1.100:8080\n\n";

  const clientSeq = 1000 + Math.floor(Math.random() * 5000);
  const serverSeq = 8000 + Math.floor(Math.random() * 5000);

  setTimeout(() => {
    terminal.textContent += `[STEP 1 - SYN] Client -> Server:\n  Flags: [SYN] | Seq=${clientSeq} | Win=64240 | MSS=1460 (SACK permitted)\n`;
    terminal.scrollTop = terminal.scrollHeight;
  }, 300);

  setTimeout(() => {
    terminal.textContent += `[STEP 2 - SYN-ACK] Server -> Client:\n  Flags: [SYN, ACK] | Seq=${serverSeq} | Ack=${clientSeq + 1} | Win=65535\n`;
    terminal.scrollTop = terminal.scrollHeight;
  }, 750);

  setTimeout(() => {
    terminal.textContent += `[STEP 3 - ACK] Client -> Server:\n  Flags: [ACK] | Seq=${clientSeq + 1} | Ack=${serverSeq + 1} | Win=64240\n\n`;
    terminal.textContent += `>>> TCP CONNECTION ESTABLISHED: Socket stream OPEN at 192.168.1.100:8080 <<<\nReliable connection-oriented transport verified with zero packet dropped.`;
    terminal.scrollTop = terminal.scrollHeight;

    if (badge) {
      badge.textContent = "ESTABLISHED";
      badge.style.color = "#10b981";
    }

    logNetworkMessage(`[TCP HANDSHAKE] Socket 192.168.1.50:49152 <-> 192.168.1.100:8080 ESTABLISHED.`);
    showToast("TCP Handshake Verified", "Connection ESTABLISHED via 3-way handshake.", "success");
  }, 1250);
}

/**
 * Traffic Burst: Simulates sequential rush hour tag scans
 */
function simulateGateRushBurst() {
  showToast("Burst Simulation", "Simulating rapid card scans at RFID gate...", "warning");
  logNetworkMessage("[BURST TEST] Initiating multi-tag traffic burst across LAN socket...");

  simulateScanInput('STU1001');
  setTimeout(() => {
    simulateScanInput('STU1002');
  }, 1000);
  setTimeout(() => {
    simulateScanInput('STU1003');
  }, 2200);
}
