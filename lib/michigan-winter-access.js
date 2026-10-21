'use strict';
// Curated public winter destinations. Coordinates identify park/recreation vicinity
// (not guaranteed plowed parking spaces or trailhead access).
// All source URLs are official operator/DNR pages. Seasonal road rules prevail.
const PLACES=Object.freeze([
 {id:'hartwick-pines',name:'Hartwick Pines State Park',region:'Northern Lower',lat:44.73583,lon:-84.65667,
   activities:['any','snowshoe','xc','kids','photo'],url:'https://www.michigan.gov/recsearch/parks/hartwick',
   address:'3612 State Park Dr, Grayling, MI 49738',
   access_note:'The DNR lists XC skiing and snowshoeing. Au Sable River Trail footbridge section closed; use marked open trails. Confirm plowing and parking with park staff.',
   winter_road_verified:false},
 {id:'young-state-park',name:'Young State Park',region:'Northwest Lower',lat:45.23579,lon:-85.042,
   activities:['any','snowshoe','xc','kids','photo'],url:'https://www.michigan.gov/recsearch/parks/young',
   address:'Young State Park, Boyne City, MI',access_note:'DNR-listed XC/snowshoe recreation. Winter parking and individual trail condition require a day-of check.',
   winter_road_verified:false},
 {id:'tahquamenon-falls',name:'Tahquamenon Falls State Park',region:'Eastern U.P.',lat:46.610734,lon:-85.206323,
   activities:['any','snowshoe','photo','kids'],url:'https://www.michigan.gov/recsearch/parks/tahquamenonfalls',
   address:'Tahquamenon Falls State Park Lower Falls, Paradise, MI',
   access_note:'DNR lists marked winter snowshoe routes and day-use parking at Upper and Lower Falls. Verify which approach and trail are open.',
   winter_road_verified:false},
 {id:'hoffmaster',name:'P. J. Hoffmaster State Park',region:'Southwest Lower',lat:43.12389,lon:-86.265,
   activities:['any','snowshoe','xc','kids','photo'],url:'https://www.michigan.gov/recsearch/parks/hoffmaster',
   address:'6585 Lake Harbor Rd, Muskegon, MI 49441',
   access_note:'DNR lists XC and snowshoe activities. Park centroid is not a validated winter parking spot.',
   winter_road_verified:false},
 {id:'porkies-winter-sports',name:'Porcupine Mountains Winter Sports Complex',region:'Western U.P.',lat:46.818,lon:-89.650167,
   activities:['any','snowshoe','xc','photo','kids'],url:'https://www.michigan.gov/skitheporkies/plan-your-visit',
   address:'36672 M-107, Ontonagon, MI 49953',
   access_note:'WINTER ROAD RESTRICTION: approach from the east on M-64. South Boundary Road is closed to cars in winter; venue operations depend on weather. Verify before departure.',
   winter_road_verified:false}
]);
function miles(a,b,c,d){
 const r=Math.PI/180,la=(c-a)*r,lo=(d-b)*r;
 const z=Math.sin(la/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(lo/2)**2;
 return 3958.7613*2*Math.atan2(Math.sqrt(Math.max(0,z)),Math.sqrt(Math.max(0,1-z)));
}
function estimatedMinutes(origin,place){
 const milesApart=miles(origin.lat,origin.lon,place.lat,place.lon);
 return Math.max(15,Math.round(milesApart/45*60+25));
}
function candidates(origin,maxMinutes,activity='any'){
 return PLACES.filter(p=>(activity==='any'||p.activities.includes(activity))&&estimatedMinutes(origin,p)<=maxMinutes*1.55)
   .map(p=>({...p,discovery_source:'documented-public-venue',estimated:estimatedMinutes(origin,p),
     drive_minutes:estimatedMinutes(origin,p),travel_source:'estimated',
     access_status:'public-destination-documented-winter-parking-unverified'}))
   .sort((a,b)=>a.estimated-b.estimated);
}
module.exports={PLACES,miles,estimatedMinutes,candidates};
