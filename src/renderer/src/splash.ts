// The splash gets Vessel's version in its address (#0.1.1).
const version = decodeURIComponent(location.hash.slice(1));
document.getElementById('version')!.textContent = version ? `VERSION ${version}` : '';
document.getElementById('copyright')!.textContent = `© ${new Date().getFullYear()} Vessel contributors`;
