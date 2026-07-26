// Generic venue/cafe dictionaries and neighborhood colors — safe to commit.
// Known venues improve live-sync matching; cafes feed the Suggest feature.

export const VENUES = {
  // --- San Francisco ---
  sfo: { name: 'SFO Airport', address: 'San Francisco International Airport', lat: 37.6191, lng: -122.3816, hood: 'SFO' },
  arup: { name: '560 Mission St', address: '560 Mission St, San Francisco', lat: 37.7885, lng: -122.3985, hood: 'SoMa' },
  andytown: { name: 'Andytown Coffee Roasters', address: '66 Kearny St, San Francisco', lat: 37.7889, lng: -122.4038, hood: 'FiDi' },
  primeRib: { name: 'House of Prime Rib', address: '1906 Van Ness Ave, San Francisco', lat: 37.794, lng: -122.4224, hood: 'Polk / Van Ness' },
  blueBottleSansome: { name: 'Blue Bottle Coffee', address: '115 Sansome St, San Francisco', lat: 37.7914, lng: -122.401, hood: 'FiDi' },
  headline: { name: 'Headline (above Dalida)', address: '101 Montgomery St Ste 200, Presidio', lat: 37.799, lng: -122.4585, hood: 'Presidio' },
  upfordayz: { name: 'UPFORDAYZ Cafe & Bakery', address: '1801 Polk St, San Francisco', lat: 37.794, lng: -122.4212, hood: 'Polk Gulch' },
  woolyPig: { name: 'Wooly Pig', address: '2295 3rd St, San Francisco', lat: 37.7601, lng: -122.3886, hood: 'Dogpatch' },
  folsom120: { name: '120 Folsom St', address: '120 Folsom St, San Francisco', lat: 37.7897, lng: -122.3903, hood: 'Rincon Hill' },
  mission965: { name: '965 Mission St', address: '965 Mission St, San Francisco', lat: 37.7817, lng: -122.4056, hood: 'SoMa' },
  sequome: { name: 'Sequome', address: '329 Oyster Point Blvd Ste 300, South San Francisco', lat: 37.6633, lng: -122.3785, hood: 'South SF' },
  second168: { name: '168 2nd St', address: '168 2nd St, San Francisco', lat: 37.7871, lng: -122.3987, hood: 'East Cut' },

  // --- New York ---
  utopiaBagels: { name: 'Utopia Bagels', address: '120 E 34th St, New York', lat: 40.7465, lng: -73.98, hood: 'Murray Hill' },
  w23_50: { name: '50 W 23rd St', address: '50 W 23rd St, New York', lat: 40.7428, lng: -73.9917, hood: 'Flatiron' },
  residentFlatiron: { name: 'Resident Company Club', address: '115 E 23rd St, 4th Fl, New York', lat: 40.7396, lng: -73.9852, hood: 'Flatiron' },
  lifetimeCooper: { name: 'Life Time', address: '62 Cooper Sq, New York', lat: 40.729, lng: -73.9917, hood: 'NoHo' },
  arloWilliamsburg: { name: 'Arlo Williamsburg', address: '96 Wythe Ave, Brooklyn', lat: 40.722, lng: -73.9576, hood: 'Williamsburg' },
  watchhouse: { name: 'WatchHouse', address: '287 Park Ave S, New York', lat: 40.7397, lng: -73.9857, hood: 'Flatiron' },
  twentyTwo: { name: 'The Twenty Two', address: '16 E 16th St, New York', lat: 40.737, lng: -73.9926, hood: 'Union Square' },
  microsoftFlatiron: { name: 'Microsoft (rooftop)', address: '122 5th Ave, New York', lat: 40.7396, lng: -73.9926, hood: 'Flatiron' },
  watts58: { name: '58 Watts St', address: '58 Watts St, New York', lat: 40.7248, lng: -74.007, hood: 'Hudson Square' },
  yunara: { name: 'Yunara Life', address: '115 E 23rd St, 10th Fl, New York', lat: 40.7396, lng: -73.9852, hood: 'Flatiron' },
  ewr: { name: 'Newark EWR', address: 'Newark Liberty International Airport', lat: 40.6895, lng: -74.1745, hood: 'EWR' },
};

export const CAFES = [
  { key: 'farleys', name: "Farley's", address: '1315 18th St, San Francisco', lat: 37.7625, lng: -122.3971, hood: 'Potrero Hill', city: 'SF' },
  { key: 'blueBottleSansome', name: 'Blue Bottle Coffee', address: '115 Sansome St, San Francisco', lat: 37.7914, lng: -122.401, hood: 'FiDi', city: 'SF' },
  { key: 'andytown', name: 'Andytown Coffee Roasters', address: '66 Kearny St, San Francisco', lat: 37.7889, lng: -122.4038, hood: 'FiDi', city: 'SF' },
  { key: 'sightglass', name: 'Sightglass Coffee', address: '270 7th St, San Francisco', lat: 37.7768, lng: -122.4086, hood: 'SoMa', city: 'SF' },
  { key: 'saintFrank', name: 'Saint Frank Coffee', address: '2340 Polk St, San Francisco', lat: 37.7986, lng: -122.4222, hood: 'Russian Hill', city: 'SF' },
  { key: 'bbFerry', name: 'Blue Bottle — Ferry Building', address: '1 Ferry Building #7, San Francisco', lat: 37.7955, lng: -122.3937, hood: 'Embarcadero', city: 'SF' },
  { key: 'equator', name: 'Equator Coffees', address: '986 Market St, San Francisco', lat: 37.7827, lng: -122.4096, hood: 'Mid-Market', city: 'SF' },
  { key: 'theMill', name: 'The Mill', address: '736 Divisadero St, San Francisco', lat: 37.7764, lng: -122.4376, hood: 'NoPa', city: 'SF' },
  { key: 'verve', name: 'Verve Coffee', address: '2101 Market St, San Francisco', lat: 37.767, lng: -122.429, hood: 'Castro edge', city: 'SF' },
  { key: 'upfordayz', name: 'UPFORDAYZ Cafe', address: '1801 Polk St, San Francisco', lat: 37.794, lng: -122.4212, hood: 'Polk Gulch', city: 'SF' },
  { key: 'watchhouse', name: 'WatchHouse', address: '287 Park Ave S, New York', lat: 40.7397, lng: -73.9857, hood: 'Flatiron', city: 'NYC' },
  { key: 'utopiaBagels', name: 'Utopia Bagels', address: '120 E 34th St, New York', lat: 40.7465, lng: -73.98, hood: 'Murray Hill', city: 'NYC' },
  { key: 'laCabra', name: 'La Cabra', address: '152 2nd Ave, New York', lat: 40.7291, lng: -73.9873, hood: 'East Village', city: 'NYC' },
  { key: 'devocion', name: 'Devoción', address: '25 E 20th St, New York', lat: 40.7391, lng: -73.9889, hood: 'Flatiron', city: 'NYC' },
];

export const HOOD_COLORS = {
  'Nob Hill': '#6B5B95',
  FiDi: '#2A6F8E',
  SoMa: '#B26234',
  'East Cut': '#B26234',
  'Rincon Hill': '#B26234',
  'Polk / Van Ness': '#B8873A',
  'Polk Gulch': '#B8873A',
  'Russian Hill': '#B8873A',
  'Dogpatch': '#3F7D5E',
  'Potrero Hill': '#3F7D5E',
  Presidio: '#8A5578',
  'South SF': '#7A7568',
  SFO: '#7A7568',
  EWR: '#7A7568',
  // NYC
  Flatiron: '#2A6F8E',
  'Union Square': '#2A6F8E',
  'Murray Hill': '#6B5B95',
  NoHo: '#B26234',
  'East Village': '#B26234',
  Williamsburg: '#3F7D5E',
  'Hudson Square': '#8A5578',
  NoMad: '#6B5B95',
  virtual: '#8C929C',
  tbd: '#C0473E',
};
