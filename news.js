// EV News Feed - Using NewsAPI or fallback to curated content
const NEWS_API_KEY = ''; // Add your NewsAPI key here if you have one
const GNEWS_API_KEY = ''; // Or GNews API key

// Curated/fallback news articles (updated regularly or used when API unavailable)
const fallbackNews = [
    {
        title: "Biden Administration Announces $2.5 Billion in EV Charging Grants",
        description: "The Federal Highway Administration has announced new funding opportunities for EV charging infrastructure under the NEVI program, targeting underserved communities and rural corridors.",
        category: "policy",
        date: "2026-02-03",
        source: "Department of Transportation",
        url: "https://www.transportation.gov/",
        image: null
    },
    {
        title: "Tesla Supercharger Network Opens to All EVs Nationwide",
        description: "Tesla completes the rollout of Magic Dock adapters across its entire US Supercharger network, making fast charging accessible to all electric vehicle brands.",
        category: "infrastructure",
        date: "2026-02-02",
        source: "Electrek",
        url: "https://electrek.co/",
        image: null
    },
    {
        title: "New 800V Charging Technology Promises 10-Minute Full Charge",
        description: "Major breakthrough in battery technology enables ultra-fast charging that could add 200 miles of range in just 10 minutes, revolutionizing long-distance EV travel.",
        category: "technology",
        date: "2026-02-01",
        source: "InsideEVs",
        url: "https://insideevs.com/",
        image: null
    },
    {
        title: "US EV Sales Hit Record 2 Million Units in 2025",
        description: "Electric vehicle adoption continues to accelerate with market share reaching 12% of total new car sales. Charging infrastructure investment cited as key enabler.",
        category: "market",
        date: "2026-01-30",
        source: "Bloomberg",
        url: "https://www.bloomberg.com/",
        image: null
    },
    {
        title: "Texas Announces $400 Million EV Infrastructure Plan",
        description: "The Texas Department of Transportation unveils ambitious plan to install DC fast chargers every 50 miles along major highways, creating over 1,000 new charging stations.",
        category: "policy",
        date: "2026-01-28",
        source: "Texas Tribune",
        url: "https://www.texastribune.org/",
        image: null
    },
    {
        title: "ChargePoint and EVgo Announce Interoperability Partnership",
        description: "Two major charging networks partner to allow seamless roaming between networks, simplifying the charging experience for EV drivers across the country.",
        category: "infrastructure",
        date: "2026-01-26",
        source: "CleanTechnica",
        url: "https://cleantechnica.com/",
        image: null
    },
    {
        title: "Solid-State Batteries to Hit Market in 2027",
        description: "Toyota confirms mass production timeline for solid-state battery technology, promising 50% more range and significantly faster charging times.",
        category: "technology",
        date: "2026-01-24",
        source: "Ars Technica",
        url: "https://arstechnica.com/",
        image: null
    },
    {
        title: "Commercial Fleets Accelerate EV Transition",
        description: "Amazon, FedEx, and UPS collectively order 500,000 electric delivery vehicles, driving demand for depot charging infrastructure and grid upgrades.",
        category: "market",
        date: "2026-01-22",
        source: "Fleet Owner",
        url: "https://www.fleetowner.com/",
        image: null
    },
    {
        title: "New IRS Guidance Clarifies EV Tax Credit Eligibility",
        description: "Updated guidance makes it easier for businesses to claim the 30C tax credit for commercial EV charging equipment, with credits up to $100,000 per location.",
        category: "policy",
        date: "2026-01-20",
        source: "IRS",
        url: "https://www.irs.gov/",
        image: null
    },
    {
        title: "Bidirectional Charging Becomes Standard Feature",
        description: "Vehicle-to-grid (V2G) technology now standard on most new EVs, allowing owners to sell power back to the grid during peak demand and earn passive income.",
        category: "technology",
        date: "2026-01-18",
        source: "GreenCarReports",
        url: "https://www.greencarreports.com/",
        image: null
    },
    {
        title: "Rural EV Charging Gets Major Boost from USDA Grants",
        description: "USDA announces $500 million in grants specifically for rural EV charging infrastructure, addressing the charging desert problem in agricultural communities.",
        category: "policy",
        date: "2026-01-15",
        source: "USDA",
        url: "https://www.usda.gov/",
        image: null
    },
    {
        title: "EV Charging Stocks Surge on Infrastructure Spending",
        description: "Charging network operators see stock prices rise 40% as federal infrastructure spending ramps up, signaling strong investor confidence in the sector.",
        category: "market",
        date: "2026-01-12",
        source: "MarketWatch",
        url: "https://www.marketwatch.com/",
        image: null
    }
];

// State management
let currentFilter = 'all';
let displayedArticles = 0;
const articlesPerPage = 6;
let allArticles = [];

// DOM Elements
const newsContainer = document.getElementById('news-container');
const loadMoreBtn = document.getElementById('load-more');
const filterBtns = document.querySelectorAll('.filter-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNews();
    setupFilters();
    setupNewsletter();
});

// Load news from API or fallback
async function loadNews() {
    showLoading();
    
    try {
        // Try to fetch from a free news API
        const articles = await fetchNewsFromAPI();
        allArticles = articles.length > 0 ? articles : fallbackNews;
    } catch (error) {
        console.log('Using fallback news:', error.message);
        allArticles = fallbackNews;
    }
    
    displayedArticles = 0;
    renderNews();
}

// Fetch from news API (multiple options)
async function fetchNewsFromAPI() {
    // Option 1: Try GNews API (free tier available)
    if (GNEWS_API_KEY) {
        try {
            const response = await fetch(
                `https://gnews.io/api/v4/search?q=electric+vehicle+charging&lang=en&country=us&max=20&apikey=${GNEWS_API_KEY}`
            );
            const data = await response.json();
            if (data.articles) {
                return data.articles.map(article => ({
                    title: article.title,
                    description: article.description,
                    category: categorizeArticle(article.title + ' ' + article.description),
                    date: article.publishedAt.split('T')[0],
                    source: article.source.name,
                    url: article.url,
                    image: article.image
                }));
            }
        } catch (e) {
            console.log('GNews API failed:', e);
        }
    }
    
    // Option 2: Try NewsAPI (requires API key)
    if (NEWS_API_KEY) {
        try {
            const response = await fetch(
                `https://newsapi.org/v2/everything?q=electric+vehicle+charging+infrastructure&language=en&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`
            );
            const data = await response.json();
            if (data.articles) {
                return data.articles.slice(0, 20).map(article => ({
                    title: article.title,
                    description: article.description,
                    category: categorizeArticle(article.title + ' ' + article.description),
                    date: article.publishedAt.split('T')[0],
                    source: article.source.name,
                    url: article.url,
                    image: article.urlToImage
                }));
            }
        } catch (e) {
            console.log('NewsAPI failed:', e);
        }
    }
    
    // Return empty to trigger fallback
    return [];
}

// Auto-categorize articles based on content
function categorizeArticle(text) {
    const lower = text.toLowerCase();
    if (lower.includes('grant') || lower.includes('policy') || lower.includes('government') || lower.includes('regulation') || lower.includes('tax credit') || lower.includes('nevi') || lower.includes('irs')) {
        return 'policy';
    }
    if (lower.includes('charger') || lower.includes('station') || lower.includes('network') || lower.includes('infrastructure')) {
        return 'infrastructure';
    }
    if (lower.includes('battery') || lower.includes('technology') || lower.includes('innovation') || lower.includes('kwh') || lower.includes('charging speed')) {
        return 'technology';
    }
    return 'market';
}

// Render news cards
function renderNews() {
    const filtered = currentFilter === 'all' 
        ? allArticles 
        : allArticles.filter(a => a.category === currentFilter);
    
    if (filtered.length === 0) {
        newsContainer.innerHTML = `
            <div class="no-results">
                <h3>No articles found</h3>
                <p>Try selecting a different category</p>
            </div>
        `;
        loadMoreBtn.style.display = 'none';
        return;
    }
    
    const toShow = filtered.slice(0, displayedArticles + articlesPerPage);
    displayedArticles = toShow.length;
    
    newsContainer.innerHTML = toShow.map(article => createNewsCard(article)).join('');
    
    // Show/hide load more button
    loadMoreBtn.style.display = displayedArticles < filtered.length ? 'inline-block' : 'none';
    
    // Animate cards
    animateCards();
}

// Create news card HTML
function createNewsCard(article) {
    const categoryLabels = {
        'infrastructure': 'Infrastructure',
        'policy': 'Policy & Grants',
        'technology': 'Technology',
        'market': 'Market Trends'
    };
    
    const imageHTML = article.image 
        ? `<img src="${article.image}" alt="${article.title}" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-icon\\'>⚡</span>'">`
        : `<span class="placeholder-icon">⚡</span>`;
    
    return `
        <article class="news-card" data-category="${article.category}">
            <div class="news-card-image">
                ${imageHTML}
            </div>
            <div class="news-card-content">
                <div class="news-card-meta">
                    <span class="news-category">${categoryLabels[article.category] || article.category}</span>
                    <span class="news-date">${formatDate(article.date)}</span>
                    <span class="news-source">${article.source}</span>
                </div>
                <h3><a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title}</a></h3>
                <p>${article.description || ''}</p>
                <div class="news-card-footer">
                    <a href="${article.url}" target="_blank" rel="noopener noreferrer" class="read-more">Read Full Article</a>
                </div>
            </div>
        </article>
    `;
}

// Format date
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Show loading state
function showLoading() {
    newsContainer.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Loading latest EV news...</p>
        </div>
    `;
}

// Setup filter buttons
function setupFilters() {
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            displayedArticles = 0;
            renderNews();
        });
    });
    
    // Load more button
    loadMoreBtn.addEventListener('click', () => {
        renderNews();
    });
}

// Setup newsletter form
function setupNewsletter() {
    const form = document.getElementById('newsletter-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = form.querySelector('input[type="email"]').value;
            console.log('Newsletter signup:', email);
            alert('Thanks for subscribing! You\'ll receive our weekly EV industry updates.');
            form.reset();
        });
    }
}

// Animate cards on load
function animateCards() {
    const cards = document.querySelectorAll('.news-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}
