// ─────────────────────────────────────────────────────────────
// JobDirect India — Scraper Engine v6
// New: API scrapers for Amazon, Google, Microsoft, Apple,
//      Meta, Oracle, IBM, SAP — no browser needed
// Fixed: Chrome path for Railway Linux
// Run:  node scraper.js           (incremental, every 10 min)
//       node scraper.js --fullsync (all current jobs, once)
// ─────────────────────────────────────────────────────────────

const axios     = require("axios");
const puppeteer = require("puppeteer");
const cron      = require("node-cron");

const { initializeApp } = require("firebase/app");
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

// ── COMPANIES ────────────────────────────────────────────────
const COMPANIES = [

  // ── GREENHOUSE — verified working ────────────────────────────
  { id:"razorpay",     name:"Razorpay",        ats:"greenhouse", token:"razorpaysoftwareprivatelimited", sector:"Fintech" },
  { id:"phonepe",      name:"PhonePe",          ats:"greenhouse", token:"phonepe",                       sector:"Fintech" },
  { id:"groww",        name:"Groww",            ats:"greenhouse", token:"groww",                         sector:"Fintech" },

  // ── LEVER — verified ─────────────────────────────────────────
  { id:"zepto",        name:"Zepto",            ats:"lever", lid:"zeptonow",  sector:"Consumer Tech" },
  { id:"nykaa",        name:"Nykaa",            ats:"lever", lid:"nykaa",     sector:"Consumer Tech" },

  // ── WORKDAY ───────────────────────────────────────────────────
  { id:"accenture",    name:"Accenture India",  ats:"workday", wid:"accenture",      wpath:"Accenture_Experienced_Hiring", sector:"Consulting" },
  { id:"capgemini",    name:"Capgemini India",  ats:"workday", wid:"capgeminigroup", wpath:"Capgemini",                    sector:"IT & Technology" },
  { id:"deloitte",     name:"Deloitte India",   ats:"workday", wid:"deloitte",       wpath:"Deloitte",                     sector:"Consulting" },
  { id:"pwc",          name:"PwC India",        ats:"workday", wid:"pwc",            wpath:"Global",                       sector:"Consulting" },
  { id:"ey",           name:"EY India",         ats:"workday", wid:"ey",             wpath:"EY_External",                  sector:"Consulting" },
  { id:"kpmg",         name:"KPMG India",       ats:"workday", wid:"kpmg",           wpath:"ExternalCareers",              sector:"Consulting" },
  { id:"mahindra",     name:"Mahindra Group",   ats:"workday", wid:"mahindra",       wpath:"Careers",                      sector:"Manufacturing" },
  { id:"persistent",   name:"Persistent",       ats:"workday", wid:"persistent",     wpath:"external",                     sector:"IT & Technology" },
  { id:"mphasis",      name:"Mphasis",          ats:"workday", wid:"mphasis",        wpath:"External",                     sector:"IT & Technology" },
  { id:"ltimindtree",  name:"LTIMindtree",      ats:"workday", wid:"ltimindtree",    wpath:"LTIMindtreeExternal",          sector:"IT & Technology" },
  { id:"hul",          name:"HUL",              ats:"workday", wid:"unilever",       wpath:"External",                     sector:"FMCG" },
  { id:"bajajfinserv", name:"Bajaj Finserv",    ats:"workday", wid:"bajajfinserv",   wpath:"External",                     sector:"BFSI" },

  // ── DIRECT API — no browser needed ───────────────────────────
  {
    id:"amazon", name:"Amazon India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://www.amazon.jobs/en/search.json?base_query=&loc_query=India&job_count=20&result_limit=20&sort=relevant",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" }, timeout:15000 }
      );
      return (res.data?.jobs || []).map(j => ({
        role:     j.title || "Unknown",
        location: j.location || "India",
        applyUrl: `https://www.amazon.jobs${j.job_path || ""}`,
        jobType:  j.job_category || "Full-time",
        description: j.description_short || "",
      }));
    }
  },
  {
    id:"google", name:"Google India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://careers.google.com/api/v3/search/?location=India&num=20&page=1&sort_by=date",
        { headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept":"application/json, text/plain, */*",
            "Referer":"https://careers.google.com/jobs/results/"
          }, timeout:15000 }
      );
      return (res.data?.jobs || []).map(j => ({
        role:     j.title || "Unknown",
        location: (j.locations || ["India"]).join(", "),
        applyUrl: `https://careers.google.com/jobs/results/${j.id || ""}`,
        jobType:  "Full-time",
        description: j.description || "",
      }));
    }
  },
  {
    id:"microsoft", name:"Microsoft India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://careers.microsoft.com/v2/api/jobs?l=en_us&pg=1&pgSz=20&o=Relevance&flt=true&lc=India",
        { headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept":"application/json",
            "Referer":"https://careers.microsoft.com/v2/global/en/locations/india.html"
          }, timeout:15000 }
      );
      const jobs = res.data?.operationResult?.result?.jobs ||
                   res.data?.jobs || [];
      return jobs.map(j => ({
        role:     j.title || "Unknown",
        location: j.primaryLocation || j.location || "India",
        applyUrl: `https://careers.microsoft.com/v2/global/en/job/${j.jobId || j.id || ""}`,
        jobType:  j.employmentType || "Full-time",
        description: j.descriptionTeaser || j.description || "",
      }));
    }
  },
  {
    id:"apple", name:"Apple India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://jobs.apple.com/api/role/search?filters=countryID%3AIND&page=1&sort=newest",
        { headers:{
            "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":"application/json",
            "Referer":"https://jobs.apple.com/en-in/search"
          }, timeout:15000 }
      );
      return (res.data?.searchResults || []).map(j => ({
        role:     j.postingTitle || j.title || "Unknown",
        location: j.locations?.[0]?.name || "India",
        applyUrl: `https://jobs.apple.com/en-in/details/${j.positionId || j.id || ""}`,
        jobType:  "Full-time",
        description: j.jobSummary || "",
      }));
    }
  },
  {
    id:"meta", name:"Meta India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const params = new URLSearchParams({
        doc_id: "9897385630303160",
        variables: JSON.stringify({
          search_input: {
            q: "", divisions:[], offices:["India"], roles:[],
            leadership_levels:[], saved_jobs:[], saved_searches:[],
            sub_teams:[], teams:[], page:1
          }
        })
      });
      const res = await axios.post(
        "https://www.metacareers.com/graphql",
        params.toString(),
        { headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type":"application/x-www-form-urlencoded",
            "Accept":"application/json",
            "x-fb-friendly-name":"CareersJobSearchResultsQuery"
          }, timeout:15000 }
      );
      const jobs = res.data?.data?.job_search?.results || [];
      return jobs.map(j => ({
        role:     j.title || "Unknown",
        location: j.locations?.join(", ") || "India",
        applyUrl: `https://www.metacareers.com/jobs/${j.id || ""}`,
        jobType:  "Full-time",
        description: j.description || "",
      }));
    }
  },
  {
    id:"oracle", name:"Oracle India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://careers.oracle.com/jobs/search?location=India&limit=20&offset=0",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" }, timeout:15000 }
      );
      const jobs = res.data?.items || res.data?.jobs || [];
      return jobs.map(j => ({
        role:     j.title || j.primaryJobFamily || "Unknown",
        location: j.primaryLocation || "India",
        applyUrl: j.applyUrl || `https://careers.oracle.com/jobs/${j.id || ""}`,
        jobType:  "Full-time",
        description: j.shortDescription || "",
      }));
    }
  },
  {
    id:"ibm", name:"IBM India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://www.ibm.com/careers/json/getJobListings.json?country=India&numJobs=20&start=0",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" }, timeout:15000 }
      );
      const jobs = res.data?.jobs || res.data?.jobResults || [];
      return jobs.map(j => ({
        role:     j.title || "Unknown",
        location: j.location || "India",
        applyUrl: j.url || `https://www.ibm.com/careers/job/${j.id || ""}`,
        jobType:  "Full-time",
        description: j.description || "",
      }));
    }
  },
  {
    id:"sap", name:"SAP India", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://jobs.sap.com/search/?q=&locname=India&limit=20&offset=0",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" }, timeout:15000 }
      );
      const jobs = res.data?.results || res.data?.jobs || [];
      return jobs.map(j => ({
        role:     j.title || "Unknown",
        location: j.city || j.country || "India",
        applyUrl: j.apply_url || j.canonical_url || "https://jobs.sap.com",
        jobType:  "Full-time",
        description: j.description || "",
      }));
    }
  },

  // ── NEW ADDITIONS ────────────────────────────────────────────
  // Flipkart — uses custom careers portal
  { id:"flipkart",     name:"Flipkart",          ats:"api", sector:"Consumer Tech",
    fetcher: async () => {
      const res = await axios.get(
        "https://www.flipkartcareers.com/#!/joblist",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json" }, timeout:15000 }
      );
      const jobs = res.data?.jobList || res.data?.jobs || [];
      return jobs.map(j => ({
        role:     j.jobTitle || j.title || "Unknown",
        location: j.jobLocation || j.location || "India",
        applyUrl: `https://www.flipkartcareers.com/#!/jobdetail/${j.jobId || j.id || ""}`,
        jobType:  "Full-time",
        description: j.jobDescription || "",
      }));
    }
  },
  // Myntra — Greenhouse
  { id:"myntra",       name:"Myntra",            ats:"greenhouse", token:"myntra",        sector:"Consumer Tech" },
  // Atlassian — Greenhouse
  { id:"atlassian",    name:"Atlassian India",   ats:"greenhouse", token:"atlassian",     sector:"IT & Technology" },
  // Freshworks — Greenhouse
  { id:"freshworks",   name:"Freshworks",        ats:"greenhouse", token:"freshworks",    sector:"IT & Technology" },
  // Walmart Global Tech — uses their own API
  { id:"walmart",      name:"Walmart Global Tech", ats:"api", sector:"IT & Technology",
    fetcher: async () => {
      const res = await axios.get(
        "https://careers.walmart.com/api/jobs?q=&location=India&page=0&sort=date&expand=department,brand,type,rate&jobCareerArea=all",
        { headers:{ "User-Agent":"Mozilla/5.0", "Accept":"application/json", "Referer":"https://careers.walmart.com" }, timeout:15000 }
      );
      const jobs = res.data?.jobs || [];
      return jobs.filter(j => /india|bangalore|bengaluru|hyderabad|chennai|mumbai/i.test(j.locationName || "")).map(j => ({
        role:     j.title || "Unknown",
        location: j.locationName || "India",
        applyUrl: `https://careers.walmart.com/us/jobs/${j.jobId || ""}`,
        jobType:  j.type || "Full-time",
        description: j.shortDescription || "",
      }));
    }
  },
  // Adobe India — Workday
  { id:"adobe",        name:"Adobe India",       ats:"workday", wid:"adobe",     wpath:"External",    sector:"IT & Technology" },

  // ── CUSTOM (Puppeteer — browser based) ───────────────────────
  // These still use browser scraping for now
  // Will be upgraded to API in next update
  { id:"tcs",          name:"TCS",              ats:"custom", url:"https://www.tcs.com/careers/india",                         sector:"IT & Technology" },
  { id:"infosys",      name:"Infosys",          ats:"custom", url:"https://career.infosys.com/joblist",                        sector:"IT & Technology" },
  { id:"wipro",        name:"Wipro",            ats:"custom", url:"https://careers.wipro.com/careers-home/jobs",                sector:"IT & Technology" },
  { id:"hcl",          name:"HCL Technologies", ats:"custom", url:"https://careers.hcltech.com/ListJobs/All",                  sector:"IT & Technology" },
  { id:"cognizant",    name:"Cognizant",        ats:"custom", url:"https://careers.cognizant.com/global/en/search-results?location=India", sector:"IT & Technology" },
  { id:"techmahindra", name:"Tech Mahindra",    ats:"custom", url:"https://careers.techmahindra.com/search/?q=&locationsearch=India", sector:"IT & Technology" },
  { id:"hdfc",         name:"HDFC Bank",        ats:"custom", url:"https://www.hdfcbank.com/careers",                           sector:"BFSI" },
  { id:"icici",        name:"ICICI Bank",       ats:"custom", url:"https://www.icicicareers.com",                               sector:"BFSI" },
  { id:"axisbank",     name:"Axis Bank",        ats:"custom", url:"https://www.axisbank.com/careers",                          sector:"BFSI" },
  { id:"paytm",        name:"Paytm",            ats:"custom", url:"https://paytm.com/careers",                                 sector:"Fintech" },
  { id:"swiggy",       name:"Swiggy",            ats:"api", sector:"Consumer Tech",
    fetcher: async () => {
      const res = await axios.post(
        "https://swiggy.mynexthire.com/employer/careers/reqlist/get",
        { source:"careers", code:"", filterByBuId:-1 },
        { headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type":"application/json",
            "Accept":"application/json",
            "Referer":"https://careers.swiggy.com"
          }, timeout:15000 }
      );
      const jobs = res.data?.data || res.data?.jobs || res.data?.reqList || (Array.isArray(res.data) ? res.data : []);
      return jobs.map(j => ({
        role:     j.jobTitle || j.title || j.reqTitle || "Unknown",
        location: j.jobLocation || j.location || j.city || "India",
        applyUrl: j.applyUrl || j.jobUrl || `https://careers.swiggy.com`,
        jobType:  j.jobType || "Full-time",
        description: j.jobDescription || j.description || "",
      }));
    }
  },
  { id:"meesho",       name:"Meesho",           ats:"custom", url:"https://meesho.io/careers",                                 sector:"Consumer Tech" },
  { id:"cred",         name:"CRED",             ats:"custom", url:"https://careers.cred.club",                                 sector:"Fintech" },
  { id:"zerodha",      name:"Zerodha",          ats:"custom", url:"https://zerodha.com/careers/",                              sector:"Fintech" },
  { id:"browserstack", name:"BrowserStack",     ats:"custom", url:"https://www.browserstack.com/careers",                     sector:"IT & Technology" },
  { id:"policybazaar", name:"PolicyBazaar",     ats:"custom", url:"https://www.policybazaar.com/careers/",                    sector:"BFSI" },
  { id:"angelone",     name:"Angel One",        ats:"custom", url:"https://www.angelone.in/careers",                          sector:"BFSI" },
  { id:"reliance",     name:"Reliance",         ats:"custom", url:"https://careers.ril.com",                                  sector:"Conglomerate" },
  { id:"lt",           name:"L&T",              ats:"custom", url:"https://careers.larsentoubro.com/careersection/jobsearch/moresearch.ftl", sector:"Manufacturing" },
  { id:"hexaware",     name:"Hexaware",         ats:"custom", url:"https://hexaware.com/careers/job-openings",                sector:"IT & Technology" },
  { id:"sunpharma",    name:"Sun Pharma",       ats:"custom", url:"https://www.sunpharma.com/careers/current-openings",       sector:"Pharma" },
  { id:"mckinsey",     name:"McKinsey India",   ats:"custom", url:"https://www.mckinsey.com/careers/search-jobs?locations=India", sector:"Consulting" },
  { id:"bcg",          name:"BCG India",        ats:"custom", url:"https://careers.bcg.com/job-search?location=India",        sector:"Consulting" },
  { id:"kotak",        name:"Kotak Bank",       ats:"custom", url:"https://www.kotak.com/en/personal-banking/tools-and-calculators/career-with-kotak.html", sector:"BFSI" },
  { id:"itc",          name:"ITC",              ats:"custom", url:"https://www.itcportal.com/people/careers.aspx",             sector:"FMCG" },
  { id:"zomato",       name:"Zomato",           ats:"custom", url:"https://www.zomato.com/careers",                           sector:"Consumer Tech" },
  { id:"dream11",      name:"Dream11",          ats:"custom", url:"https://www.dreamsports.group/careers",                    sector:"Consumer Tech" },
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

// ── GREENHOUSE ────────────────────────────────────────────────
async function scrapeGreenhouse(co) {
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
        if (await save({ id:makeId(co.id,title,loc), company:co.name, companyId:co.id,
          role:title, location:loc, sector:co.sector,
          applyUrl: j.absolute_url || j.url || "",
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

// ── LEVER ─────────────────────────────────────────────────────
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

// ── WORKDAY ───────────────────────────────────────────────────
async function scrapeWorkday(co) {
  const subdomains = ["wd3","wd1","wd5","wd102","wd12"];
  for (const sd of subdomains) {
    const url = `https://${co.wid}.${sd}.myworkdayjobs.com/wday/cxs/${co.wid}/${co.wpath}/jobs`;
    try {
      const res = await axios.post(url,
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

// ── DIRECT API ────────────────────────────────────────────────
async function scrapeApi(co) {
  try {
    const results = await co.fetcher();
    if (!results || !results.length) {
      await logRun(co.id,"no_results",0);
      return 0;
    }
    let n=0;
    // Filter India-relevant jobs
    const INDIA = /india|bangalore|bengaluru|mumbai|hyderabad|delhi|chennai|pune|noida|gurugram|gurgaon|kolkata|remote/i;
    for (const j of results) {
      if (!INDIA.test(j.location) && !INDIA.test(j.role)) continue;
      if (await save({
        id:       makeId(co.id, j.role, j.location),
        company:  co.name,
        companyId:co.id,
        role:     j.role,
        location: j.location,
        sector:   co.sector,
        applyUrl: j.applyUrl || "",
        sourceUrl:`api:${co.id}`,
        atsType:  "api",
        salaryRange: j.salaryRange || "",
        jobType:  j.jobType || "Full-time",
        description: j.description ? j.description.replace(/<[^>]*>/g,"").substring(0,300) : "",
        requirements:[],
      })) n++;
    }
    await logRun(co.id,"success",n);
    return n;
  } catch(e) {
    await logRun(co.id,"error",0,e.message);
    console.error(`    ✗ API error [${co.name}]: ${e.message.substring(0,60)}`);
    return 0;
  }
}

// ── CUSTOM (Puppeteer) ────────────────────────────────────────
async function scrapeCustom(co) {
  let browser;
  try {
    // On Railway (Linux) let Puppeteer find its own Chrome
    // On Windows use the installed Chrome
    const launchOpts = {
      headless: "new",
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu"]
    };
    // Only set executablePath on Windows
    if (process.platform === "win32") {
      launchOpts.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }

    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36");
    await page.setDefaultNavigationTimeout(30000);
    try {
      await page.goto(co.url, { waitUntil:"domcontentloaded", timeout:25000 });
    } catch {
      await page.goto(co.url, { waitUntil:"load", timeout:25000 });
    }
    await new Promise(r => setTimeout(r, 3000));

    const JOB_WORDS = /\b(engineer|developer|manager|analyst|consultant|designer|architect|lead|director|officer|associate|specialist|executive|scientist|head of|vp |vice president|product manager|data |software|backend|frontend|full.?stack|devops|sre|qa |quality|hr |human resource|finance|sales|marketing|legal|operations|recruiter|talent|strategy|intern|trainee|graduate|principal |staff |senior |junior |relationship manager|branch manager|cluster manager|site reliability|machine learning|artificial intelligence|data science)\b/i;
    const SKIP = /^(home|about|contact|login|register|sign in|sign up|apply now|submit|search|filter|load more|view all|next|prev|back|menu|skip|cookie|privacy|terms|life at|our culture|benefits|events|video|upload|campus|diversity|awards|vision|facilities|gallery|policy|sustainab|know more|learn more|click|read more|see all|explore|follow|share|youtube|copyright|powered|fraud alert|job alert|turn on|saved jobs|clear filter|latest vacanc|united states|canada \(|india \(|all other|uki \(|work_outline|eeo policy)/i;

    const jobs = await page.evaluate((jw, sk) => {
      const results=[], seen=new Set();
      const JOB_RE = new RegExp(jw, 'i');
      const SKIP_RE = new RegExp(sk, 'i');
      const sels=[
        "a[href*='/job/']","a[href*='/jobs/']","a[href*='/opening']",
        "a[href*='/position']","a[href*='/role']","a[href*='jobId']",
        ".job-title a","[class*='job-title']","[class*='jobtitle']",
        "[class*='position-title']","[class*='job-listing'] a","[class*='job-card'] a",
        "li.job a","div.job a","h3 a","h4 a"
      ];
      sels.forEach(sel=>{
        try {
          document.querySelectorAll(sel).forEach(el=>{
            const raw=(el.textContent||el.innerText||"").trim().replace(/\s+/g," ");
            const href=el.href||el.closest?.("a")?.href||"";
            if(raw.length>6&&raw.length<100&&href?.startsWith("http")&&
               !seen.has(raw.toLowerCase())&&JOB_RE.test(raw)&&!SKIP_RE.test(raw)){
              seen.add(raw.toLowerCase());
              results.push({title:raw,url:href});
            }
          });
        }catch{}
      });
      return results.slice(0,40);
    }, JOB_WORDS.source, SKIP.source);

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
  console.log(`   ${COMPANIES.length} companies · Platform: ${process.platform}`);
  console.log(`${"═".repeat(54)}`);

  let total=0;
  for (const co of COMPANIES) {
    console.log(`\n→ ${co.name} [${co.ats.toUpperCase()}]`);
    let n=0;
    try {
      if      (co.ats==="greenhouse") n = await scrapeGreenhouse(co);
      else if (co.ats==="lever")      n = await scrapeLever(co);
      else if (co.ats==="workday")    n = await scrapeWorkday(co);
      else if (co.ats==="api")        n = await scrapeApi(co);
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
console.log("🚀 JobDirect Scraper v6");
console.log(`   Mode: ${FULL_SYNC ? "FULL SYNC" : "INCREMENTAL (every 10 min)"}`);
console.log(`   Companies: ${COMPANIES.length}`);
console.log(`   Platform: ${process.platform}\n`);

run();
if (!FULL_SYNC) cron.schedule("*/10 * * * *", run);
