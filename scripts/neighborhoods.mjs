// Areas in display order, nearest Schiller Park first. Each pattern matches a place on the site.
export const NEIGHBORHOODS = [
  ["German Village & Merion Village", /schiller|moler|parsons ave, columbus|whittier|audubon/i],
  ["Downtown & Near East", /main library|96 s grant|franklin ave|naghten|mt vernon|1777 e broad|conservatory/i],
  ["Bexley", /bexley|jeffrey mansion|montrose|maryland elementary|college ave/i],
  ["Short North & Campus", /hunter ave|aquatics center|tuttle|1900 college rd/i],
  ["Grandview", /grandview/i],
  ["Franklinton & West Side", /franklinton|1061 w town|glenwood|holton|westgate|dodge/i],
  ["South Side", /marion[- ]franklin|south high|southland/i],
  ["East Side", /driving park|barnett|far east|big walnut/i],
  ["Linden & Northeast", /linden|brentnell|northeast park|cassady|howard|krumm|adams|milo/i],
  ["Clintonville", /whetstone|n high st/i],
  ["Upper Arlington", /upper arlington|wendy|wyandot|wood ave/i],
  ["Northwest & Dublin", /carriage place|sawmill|kenny|dublin|farmers dr|learn sing/i],
  ["Northland & Westerville", /lazelle|westerville|woodward|karl r/i],
  ["Powell", /powell/i],
];
export const NO_AREA = "Other locations";

const match = (text) => NEIGHBORHOODS.find(([, re]) => re.test(text))?.[0];

// The place itself decides. Listings with no location often name it in the title, like "Basketball at Barnett".
export function neighborhoodOf(i) {
  return match(`${i.location ?? ""} ${i.address ?? ""}`) ?? match(i.provider ?? "") ?? match(i.name ?? "") ?? NO_AREA;
}
