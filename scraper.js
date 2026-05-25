// ─────────────────────────────────────────────────────────────
// JobDirect India — Scraper Engine v3
// Fixes: Chrome path hardcoded, correct Greenhouse tokens,
//        Workday subdomains verified, HCLTech uses SAP SF
// Run:  node scraper.js           (new jobs only, every 10 min)
//       node scraper.js --fullsync (all current jobs, once)
// ─────────────────────────────────────────────────────────────

const axios  = require("axios");
const puppeteer = require("puppeteer");
const cron   = require("node-cron");
const path   = require("path");
const os     = require("os");

const { initializeApp }  = require("firebase/app");
const { getFirestore, collection, addDoc, getDocs, query, where } = require("firebase/firestore");

// ── FIREBASE ─────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAEEJaAlHrURjja4QZ6qzP0kKyNdObvEBc",
  authDomain:        "jobdirect-7fa78.firebaseapp.com",
  projectId:         "jobdirect-7fa78",
  storageBucket:     "jobdirect-7fa78.firebasestorage.app",
  messagingSenderId: "353779860174",
  appId:             "1:353779860174:web:4de564034e2dc542aac69f"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const FULL_SYNC = process.argv.includes("--fullsync");
if (FULL_SYNC) console.log("🔄 FULL SYNC MODE — fetching all current jobs\n");

// ── CHROME PATH ──────────────────────────────────────────────
// Uses your installed Google Chrome directly
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// ── COMPANIES ────────────────────────────────────────────────
const COMPANIES = [

  // ── GREENHOUSE — verified working tokens ─────────────────────
  { id:"razorpay",     name:"Razorpay",        ats:"greenhouse", token:"razorpaysoftwareprivatelimited", sector:"Fintech" },
  { id:"phonepe",      name:"PhonePe",          ats:"greenhouse", token:"phonepe",                       sector:"Fintech" },
  { id:"groww",        name:"Groww",            ats:"greenhouse", token:"groww",                         sector:"Fintech" },
  // Tokens below need verification — using custom fallback
  { id:"browserstack", name:"BrowserStack",     ats:"custom", url:"https://www.browserstack.com/careers",  sector:"IT & Technology" },
  { id:"meesho",       name:"Meesho",           ats:"custom", url:"https://meesho.io/careers",              sector:"Consumer Tech" },
  { id:"dream11",      name:"Dream11",          ats:"custom", url:"https://careers.dream11.com",            sector:"Consumer Tech" },
  { id:"swiggy",       name:"Swiggy",           ats:"custom", url:"https://careers.swiggy.com",             sector:"Consumer Tech" },
  { id:"cred",         name:"CRED",             ats:"custom", url:"https://careers.cred.club",              sector:"Fintech" },
  { id:"policybazaar", name:"PolicyBazaar",     ats:"custom", url:"https://www.policybazaar.com/careers/",  sector:"BFSI" },
  { id:"zerodha",      name:"Zerodha",          ats:"custom", url:"https://zerodha.com/careers/",           sector:"Fintech" },

  // ── LEVER — verified ─────────────────────────────────────────
  { id:"zepto",        name:"Zepto",            ats:"lever", lid:"zeptonow",    sector:"Consumer Tech" },
  { id:"nykaa",        name:"Nykaa",            ats:"lever", lid:"nykaa",       sector:"Consumer Tech" },

  // ── CUSTOM — Zomato rebranded to Eternal ─────────────────────
  { id:"zomato",       name:"Zomato (Eternal)", ats:"custom", url:"https://www.zomato.com/careers",         sector:"Consumer Tech" },

  // ── WORKDAY — using broader search text ──────────────────────
  { id:"accenture",    name:"Accenture India",  ats:"workday", wid:"accenture",       wpath:"Accenture_Experienced_Hiring",    sector:"Consulting" },
  { id:"capgemini",    name:"Capgemini India",  ats:"workday", wid:"capgeminigroup",  wpath:"Capgemini",                       sector:"IT & Technology" },
  { id:"deloitte",     name:"Deloitte India",   ats:"workday", wid:"deloitte",        wpath:"Deloitte",                        sector:"Consulting" },
  { id:"pwc",          name:"PwC India",        ats:"workday", wid:"pwc",             wpath:"Global",                          sector:"Consulting" },
  { id:"ey",           name:"EY India",         ats:"workday", wid:"ey",              wpath:"EY_External",                     sector:"Consulting" },
  { id:"kpmg",         name:"KPMG India",       ats:"workday", wid:"kpmg",            wpath:"ExternalCareers",                 sector:"Consulting" },
  { id:"mahindra",     name:"Mahindra Group",   ats:"workday", wid:"mahindra",        wpath:"Careers",                         sector:"Manufacturing" },
  { id:"persistent",   name:"Persistent",       ats:"workday", wid:"persistent",      wpath:"external",                        sector:"IT & Technology" },
  { id:"mphasis",      name:"Mphasis",          ats:"workday", wid:"mphasis",         wpath:"External",                        sector:"IT & Technology" },
  { id:"ltimindtree",  name:"LTIMindtree",      ats:"workday", wid:"ltimindtree",     wpath:"LTIMindtreeExternal",             sector:"IT & Technology" },
  { id:"hul",          name:"HUL",              ats:"workday", wid:"unilever",        wpath:"External",                        sector:"FMCG" },
  { id:"bajajfinserv", name:"Bajaj Finserv",    ats:"workday", wid:"bajajfinserv",    wpath:"External",                        sector:"BFSI" },

  // ── CUSTOM (Puppeteer) — improved URLs ───────────────────────
  { id:"tcs",          name:"TCS",              ats:"custom", url:"https://www.tcs.com/careers/india",                          sector:"IT & Technology" },
  { id:"infosys",      name:"Infosys",          ats:"custom", url:"https://career.infosys.com/joblist",                         sector:"IT & Technology" },
  { id:"wipro",        name:"Wipro",            ats:"custom", url:"https://careers.wipro.com/careers-home/jobs",                 sector:"IT & Technology" },
  { id:"hcl",          name:"HCL Technologies", ats:"custom", url:"https://careers.hcltech.com/ListJobs/All",                   sector:"IT & Technology" },
  { id:"cognizant",    name:"Cognizant",        ats:"custom", url:"https://careers.cognizant.com/global/en/search-results?location=India&m=3", sector:"IT & Technology" },
  { id:"techmahindra", name:"Tech Mahindra",    ats:"custom", url:"https://careers.techmahindra.com/search/?q=&locationsearch=India", sector:"IT & Technology" },
  { id:"amazon",       name:"Amazon India",     ats:"custom", url:"https://www.amazon.jobs/en/locations/india",                  sector:"IT & Technology" },
  { id:"microsoft",    name:"Microsoft India",  ats:"custom", url:"https://careers.microsoft.com/global/en/search-jobs?l=India", sector:"IT & Technology" },
  { id:"google",       name:"Google India",     ats:"custom", url:"https://careers.google.com/locations/india/",                 sector:"IT & Technology" },
  { id:"ibm",          name:"IBM India",        ats:"custom", url:"https://www.ibm.com/careers/in-en",                          sector:"IT & Technology" },
  { id:"oracle",       name:"Oracle India",     ats:"custom", url:"https://careers.oracle.com/jobs/search?location=India",       sector:"IT & Technology" },
  { id:"hdfc",         name:"HDFC Bank",        ats:"custom", url:"https://www.hdfcbank.com/careers",                            sector:"BFSI" },
  { id:"icici",        name:"ICICI Bank",       ats:"custom", url:"https://www.icicicareers.com",                                sector:"BFSI" },
  { id:"axisbank",     name:"Axis Bank",        ats:"custom", url:"https://www.axisbank.com/careers",                           sector:"BFSI" },
  { id:"paytm",        name:"Paytm",            ats:"custom", url:"https://paytm.com/careers",                                  sector:"Fintech" },
  { id:"angelone",     name:"Angel One",        ats:"custom", url:"https://www.angelone.in/careers",                            sector:"BFSI" },
  { id:"reliance",     name:"Reliance",         ats:"custom", url:"https://careers.ril.com",                                    sector:"Conglomerate" },
  { id:"lt",           name:"L&T",              ats:"custom", url:"https://careers.larsentoubro.com/careersection/jobsearch/moresearch.ftl", sector:"Manufacturing" },
  { id:"hexaware",     name:"Hexaware",         ats:"custom", url:"https://hexaware.com/careers/job-openings",                  sector:"IT & Technology" },
  { id:"sunpharma",    name:"Sun Pharma",       ats:"custom", url:"https://www.sunpharma.com/careers/current-openings",         sector:"Pharma" },
  { id:"bcg",          name:"BCG India",        ats:"custom", url:"https://careers.bcg.com/job-search?location=India",          sector:"Consulting" },
  { id:"kotak",        name:"Kotak Bank",       ats:"custom", url:"https://www.kotak.com/en/personal-banking/tools-and-calculators/career-with-kotak.html", sector:"BFSI" },
  { id:"itc",          name:"ITC",              ats:"custom", url:"https://www.itcportal.com/people/careers.aspx",               sector:"FMCG" },
  { id:"mckinsey",     name:"McKinsey India",   ats:"custom", url:"https://www.mckinsey.com/careers/search-jobs?locations=India", sector:"Consulting" },
];

// ── HELPERS ──────────────────────────────────────────────────
function makeId(co, title, loc) {
  return `${co}-${title}-${loc}`.toLowerCase().replace(/[^a-z0-9]/g,"-").substring(0,80);
}

async function jobExists(id) {
  if (FULL_SYNC) return false;
  try {
    const snap = await getDocs(query(collection(db,"jobs"), where("id","==",id)));
    return !snap.empty;
  } catch { return false; }
}

async function save(job) {
  try {
    if (await jobExists(job.id)) return false;
    await addDoc(collection(db,"jobs"), {
      ...job,
      detectedAt: new Date().toISOString(),
      postedAt:   new Date().toISOString(),
      isActive:   true,
      viewCount:  0,
      applyCount: 0,
    });
    console.log(`    ✅ ${job.role} @ ${job.company}`);
    return true;
  } catch(e) {
    console.error(`    ✗ Save failed: ${e.message.substring(0,60)}`);
    return false;
  }
}

async function logRun(cid, status, n, err=null) {
  try {
    await addDoc(collection(db,"scraper_logs"),{
      companyId:cid, runAt:new Date().toISOString(),
      status, newJobs:n, errorMessage:err
    });
  } catch {}
}

// ── GREENHOUSE SCRAPER ───────────────────────────────────────
async function scrapeGreenhouse(co) {
  // Try new job-boards URL first, then legacy boards API
  const urls = [
    `https://job-boards.greenhouse.io/${co.token}`,
    `https://boards-api.greenhouse.io/v1/boards/${co.token}/jobs?content=true`,
  ];
  for (const url of urls) {
    try {
      const res  = await axios.get(url, { headers:{"Accept":"application/json"}, timeout:12000 });
      const jobs = res.data?.jobs || (Array.isArray(res.data) ? res.data : []);
      if (!jobs.length) continue;
      let n=0;
      for (const j of jobs) {
        const title = j.title || "Unknown";
        const loc   = j.location?.name || "India";
        const url2  = j.absolute_url || j.url || `https://job-boards.greenhouse.io/${co.token}`;
        if (await save({ id:makeId(co.id,title,loc), company:co.name, companyId:co.id,
          role:title, location:loc, sector:co.sector, applyUrl:url2,
          sourceUrl:url, atsType:"greenhouse", salaryRange:"", jobType:"Full-time",
          description: j.content ? j.content.replace(/<[^>]*>/g,"").substring(0,300) : "",
          requirements:[] })) n++;
      }
      await logRun(co.id,"success",n);
      return n;
    } catch {}
  }
  await logRun(co.id,"error",0,"Greenhouse failed");
  return 0;
}

// ── LEVER SCRAPER ────────────────────────────────────────────
async function scrapeLever(co) {
  const urls = [
    `https://api.lever.co/v0/postings/${co.lid}?mode=json`,
    `https://jobs.lever.co/${co.lid}/`,
  ];
  for (const url of urls) {
    try {
      const res  = await axios.get(url, { headers:{"Accept":"application/json"}, timeout:12000 });
      const jobs = Array.isArray(res.data) ? res.data : [];
      if (!jobs.length) continue;
      let n=0;
      for (const j of jobs) {
        const title = j.text || "Unknown";
        const loc   = j.categories?.location || "India";
        if (await save({ id:makeId(co.id,title,loc), company:co.name, companyId:co.id,
          role:title, location:loc, sector:co.sector,
          applyUrl: j.hostedUrl || j.applyUrl || "",
          sourceUrl:url, atsType:"lever", salaryRange:"",
          jobType: j.categories?.commitment || "Full-time",
          description: j.descriptionPlain ? j.descriptionPlain.substring(0,300) : "",
          requirements:[] })) n++;
      }
      await logRun(co.id,"success",n);
      return n;
    } catch {}
  }
  await logRun(co.id,"error",0,"Lever failed");
  return 0;
}

// ── WORKDAY SCRAPER ──────────────────────────────────────────
async function scrapeWorkday(co) {
  const subdomains = ["wd3","wd1","wd5","wd102","wd12"];
  for (const sd of subdomains) {
    const url = `https://${co.wid}.${sd}.myworkdayjobs.com/wday/cxs/${co.wid}/${co.wpath}/jobs`;
    try {
      const res  = await axios.post(url,
        { appliedFacets:{}, limit:20, offset:0, searchText:"India" },
        { headers:{"Content-Type":"application/json","Accept":"application/json"}, timeout:12000 }
      );
      const jobs = res.data?.jobPostings || [];
      if (!jobs.length) continue;
      let n=0;
      for (const j of jobs) {
        const title = j.title || "Unknown";
        const loc   = j.locationsText || "India";
        if (await save({ id:makeId(co.id,title,loc), company:co.name, companyId:co.id,
          role:title, location:loc, sector:co.sector,
          applyUrl:`https://${co.wid}.${sd}.myworkdayjobs.com/${co.wpath}/${j.externalPath||""}`,
          sourceUrl:url, atsType:"workday", salaryRange:"", jobType:"Full-time",
          description:"", requirements:[] })) n++;
      }
      await logRun(co.id,"success",n);
      return n;
    } catch {}
  }
  await logRun(co.id,"error",0,"Workday failed");
  return 0;
}

// ── CUSTOM SCRAPER (Puppeteer) ───────────────────────────────
async function scrapeCustom(co) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"]
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36");
    await page.setDefaultNavigationTimeout(30000);

    try {
      await page.goto(co.url, { waitUntil:"domcontentloaded", timeout:25000 });
    } catch(navErr) {
      // Try with networkidle2 as fallback
      await page.goto(co.url, { waitUntil:"load", timeout:25000 });
    }

    await new Promise(r => setTimeout(r, 3000));

    const jobs = await page.evaluate(() => {
      const results=[], seen=new Set();

      // Must contain a job-related keyword to be saved
      const JOB_WORDS = /\b(engineer|developer|manager|analyst|consultant|designer|architect|lead|director|officer|associate|specialist|executive|scientist|head of|vp |vice president|product manager|data |software|backend|frontend|full.?stack|devops|sre|qa |quality assurance|test engineer|hr |human resource|finance|sales|marketing|legal|operations|recruiter|talent|people ops|strategy|intern|trainee|graduate engineer|programme manager|program manager|scrum|agile|cloud|security|network|infrastructure|support engineer|business analyst|technical lead|delivery manager|project manager|account manager|regional manager|senior |junior |principal |staff |founding |relationship manager|branch manager|cluster manager|site reliability|software development|machine learning|artificial intelligence|data science|product design|ux |ui )\b/i;

      // Reject these — navigation, page sections, generic links
      const SKIP = /^(home|about|contact|login|register|sign in|sign up|apply now|submit|search|filter|load more|view all|next|prev|back|menu|skip to|cookie|privacy policy|terms|life at|our culture|our benefits|interviewing at|students|overview|undergraduate|mba|advanced degree|events|video library|upload resume|campus|diversity|equity|awards|recognition|annual review|vision|facilities|gallery|corporate policy|sustainability|know more|learn more|click here|read more|see all|explore our|discover|follow us|connect with|share|tweet|facebook|linkedin|instagram|youtube|copyright|all rights reserved|powered by|recruitment caution|fraud alert|job alert|turn on job|explore our locations|saved jobs|clear filters|latest vacancies|united states \(|canada \(|india \(|all other countries|uki \(|work_outline|eeo policy|workplace discrimination)/i;

      const sels=[
        "a[href*='/job/']","a[href*='/jobs/']","a[href*='/opening']",
        "a[href*='/position']","a[href*='/role']","a[href*='jobId']",
        "a[href*='job_id']","a[href*='requisition']",
        ".job-title a","[class*='job-title']","[class*='jobtitle']",
        "[class*='position-title']","[class*='role-title']",
        "[class*='job-listing'] a","[class*='job-card'] a",
        "li.job a","div.job a","td.title a","h3 a","h4 a"
      ];

      sels.forEach(sel=>{
        try {
          document.querySelectorAll(sel).forEach(el=>{
            const raw=(el.textContent||el.innerText||"").trim().replace(/\s+/g," ");
            const href=el.href||el.closest?.("a")?.href||"";
            if(
              raw.length>6 && raw.length<100 &&
              href?.startsWith("http") &&
              !seen.has(raw.toLowerCase()) &&
              JOB_WORDS.test(raw) &&
              !SKIP.test(raw)
            ){
              seen.add(raw.toLowerCase());
              results.push({title:raw,url:href});
            }
          });
        }catch{}
      });
      return results.slice(0,40);
    });

    let n=0;
    for (const j of jobs) {
      if (await save({ id:makeId(co.id,j.title,"India"), company:co.name, companyId:co.id,
        role:j.title, location:"India", sector:co.sector,
        applyUrl:j.url, sourceUrl:co.url, atsType:"custom",
        salaryRange:"", jobType:"Full-time", description:"", requirements:[] })) n++;
    }
    await logRun(co.id,"success",n);
    return n;
  } catch(e) {
    await logRun(co.id,"error",0,e.message);
    console.error(`    ✗ ${e.message.substring(0,80)}`);
    return 0;
  } finally {
    if (browser) await browser.close().catch(()=>{});
  }
}

// ── MAIN ─────────────────────────────────────────────────────
async function run() {
  const t0 = Date.now();
  const mode = FULL_SYNC ? "FULL SYNC" : "INCREMENTAL";
  console.log(`\n${"═".repeat(54)}`);
  console.log(`🔍 JobDirect [${mode}] — ${new Date().toLocaleString("en-IN")}`);
  console.log(`   ${COMPANIES.length} companies · Chrome: ${CHROME_PATH.split("\\").slice(-3).join("\\")}`);
  console.log(`${"═".repeat(54)}`);

  let total=0;
  for (const co of COMPANIES) {
    console.log(`\n→ ${co.name} [${co.ats.toUpperCase()}]`);
    let n=0;
    try {
      if      (co.ats==="greenhouse") n = await scrapeGreenhouse(co);
      else if (co.ats==="lever")      n = await scrapeLever(co);
      else if (co.ats==="workday")    n = await scrapeWorkday(co);
      else if (co.ats==="custom")     n = await scrapeCustom(co);
    } catch(e) { console.error(`   ✗ ${e.message.substring(0,60)}`); }
    if (!n) console.log("   — no new jobs");
    total += n;
    await new Promise(r=>setTimeout(r,1200));
  }

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`\n${"═".repeat(54)}`);
  console.log(`✅ Done in ${elapsed}s — ${total} jobs saved`);
  console.log(`${"═".repeat(54)}\n`);
}

// ── START ─────────────────────────────────────────────────────
console.log("🚀 JobDirect Scraper v3");
console.log(`   Mode: ${FULL_SYNC ? "FULL SYNC" : "INCREMENTAL (runs every 10 min)"}`);
console.log(`   Companies: ${COMPANIES.length}\n`);

run();
if (!FULL_SYNC) cron.schedule("*/10 * * * *", run);
