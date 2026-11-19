// Team-maintained map and location settings. No API key is required.
export const MAP_CONFIG={
 center:[37.5444,127.0504],zoom:15.5,minZoom:12,maxZoom:19,resourceTimeout:6000,geometryTimeout:20000,
 bounds:[[37.5375,127.035],[37.551,127.063]],
 tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
 attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
 geolocation:{enableHighAccuracy:true,maximumAge:5000,timeout:15000}
};
export const GEOFENCE_CONFIG=Object.freeze({maxAge:15000,maxAccuracy:30,entryDelay:5000,cooldown:600000,entryMargin:10,exitMargin:20,residentialProximity:25,nearbyCooldown:300000});
