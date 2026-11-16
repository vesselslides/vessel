/*
 * Site settings. This is the only file you should need to edit.
 */
window.VESSEL = {
  // GitHub repository the download page reads releases from.
  repo: "vesselslides/vessel",

  donate: {
    currency: "USD",
    symbol: "$",
    amounts: [5, 10, 25, 50],
    defaultAmount: 25,

    // Leave a provider as null to hide it.
    // GitHub Sponsors: the account or organisation with Sponsors switched on.
    // No fee is taken on sponsorships to personal accounts.
    githubSponsors: "vesselslides",
    // Ko-fi page name, e.g. "vessel" for https://ko-fi.com/vessel
    kofi: null,
    // PayPal.Me name, e.g. "vesselslides" for https://paypal.me/vesselslides
    paypal: null,
  },
};
