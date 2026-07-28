/**
 * Mock source: a deterministic sample so the whole pipeline (merge -> gate ->
 * story signals -> Excel/Airtable) can be exercised end to end with zero keys
 * and zero network. Also doubles as the reference for the RawPlace shape.
 */

const SAMPLE = [
  {
    name: "Amici Wood Fired Pizzeria",
    address: "12 Hauz Khas Village",
    lat: 28.5535, lng: 77.1945, rating: 4.5, reviewCount: 2140, priceLevel: 2,
    reviews: [
      "Their margherita is famous for the wood-fired char - the oven was imported from Naples in 2011 and it shows.",
      "Hidden on the second floor, tucked away behind the antique shop. Always packed on weekends.",
    ],
  },
  {
    name: "Roshan Di Kulfi",
    address: "Karol Bagh, Ajmal Khan Road",
    lat: 28.6519, lng: 77.1907, rating: 4.4, reviewCount: 8900, priceLevel: 1,
    reviews: [
      "An institution since 1948 - three generations of the same family still run the counter.",
      "The rabri faluda is their signature, people queue past the corner for it.",
    ],
  },
  {
    name: "Cafe Dorangos",
    address: "Shahpur Jat",
    lat: 28.5494, lng: 77.2153, rating: 4.1, reviewCount: 310, priceLevel: 2,
    reviews: ["Quiet courtyard, house-made sourdough, single-origin pour overs."],
  },
  {
    name: "Dominoz Pizza - Sector 18",
    address: "Sector 18, Noida",
    lat: 28.5708, lng: 77.3261, rating: 3.9, reviewCount: 12000, priceLevel: 1,
    reviews: ["Standard chain experience."],
  },
  {
    name: "Meh Cafe",
    address: "Somewhere",
    lat: 28.6, lng: 77.2, rating: 3.2, reviewCount: 45, priceLevel: 1,
    reviews: ["It was fine I guess."],
  },
  {
    name: "Unrated Corner Chai",
    address: "Old Delhi",
    lat: 28.656, lng: 77.23, rating: null, reviewCount: null, priceLevel: null,
    reviews: [],
  },
];

export function createMockSource() {
  return {
    name: "mock",
    async discover(city, categoryKey) {
      return SAMPLE.map((p, i) => ({
        source: "mock",
        sourceId: `mock-${i}`,
        name: p.name,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        category: categoryKey,
        rating: p.rating,
        reviewCount: p.reviewCount,
        priceLevel: p.priceLevel,
        website: null,
        mapsUrl: null,
        passages: p.reviews.map((text) => ({ text, source: "mock:review" })),
      }));
    },
  };
}
