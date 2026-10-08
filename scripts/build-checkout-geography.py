"""Build checked-in checkout JSON from locally downloaded public reference data.

Usage: python scripts/build-checkout-geography.py <source-directory>
Inputs: US.zip, GB.zip (GeoNames full postal codes), VN.json (Open Admin Data).
No customer data or network requests are involved.
"""
import collections
import json
import pathlib
import re
import sys
import unicodedata
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
source = pathlib.Path(sys.argv[1])
raw = json.loads((root / 'frontend/node_modules/country-region-data/data.json').read_text(encoding='utf8'))
countries = []
for country in raw:
    countries.append({'name': 'Việt Nam' if country['countryShortCode'] == 'VN' else country['countryName'],
                      'code': country['countryShortCode'], 'provinces': [
                          {'name': r['name'], 'code': 'HD' if country['countryShortCode'] == 'VN' and r['name'] == 'Hải Dương' else r.get('shortCode', ''),
                           'iso_code': r.get('shortCode', ''), 'locations_file': None} for r in country['regions']]})
by_code = {c['code']: c for c in countries}
grouped = collections.defaultdict(lambda: collections.defaultdict(set))

def normalized(name):
    name = name.lower().replace('đ', 'd')
    name = ''.join(ch for ch in unicodedata.normalize('NFD', name) if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', name)

for code in ['US', 'GB']:
    regions = by_code[code]['provinces']
    names = {normalized(r['name']): r for r in regions}
    if code == 'GB':
        names['cityoflondon'] = next(r for r in regions if r['code'] == 'LND')
        names['cityofedinburgh'] = next(r for r in regions if r['code'] == 'EDH')
    with zipfile.ZipFile(source / f'{code}.zip') as archive:
        filename = 'US.txt' if code == 'US' else 'GB_full.txt'
        with archive.open(filename) as stream:
            for line in stream:
                fields = line.decode('utf8').rstrip('\n').split('\t')
                if len(fields) < 9:
                    continue
                if code == 'US':
                    region = next((r for r in regions if r['code'] == fields[4]), None)
                else:
                    region = names.get(normalized(fields[7])) or names.get(normalized(fields[5]))
                    if not region and fields[7] and fields[8]:
                        region = {'name': fields[7], 'code': fields[8], 'iso_code': '', 'locations_file': None}
                        regions.append(region)
                        names[normalized(fields[7])] = region
                if region and fields[2] and fields[1]:
                    grouped[(code, region['code'])][fields[2]].add(fields[1])

wards = json.loads((source / 'VN.json').read_text(encoding='utf8'))
postal_rows = json.loads((source / 'VN-postal.json').read_text(encoding='utf8'))
postal = collections.defaultdict(set)
for row in postal_rows:
    postal[(row['province_code'], normalized(row['name']))].add(row['postal_code'])
regions = by_code['VN']['provinces']
names = {normalized(r['name']): r for r in regions}
names['hochiminh'] = next(r for r in regions if r['code'] == 'SG')
for ward in wards:
    parent = ward['parent']
    name = parent['name']['local']
    region = names.get(normalized(name))
    if not region:
        region = {'name': name, 'code': 'VN' + parent['id'], 'iso_code': '', 'locations_file': None}
        regions.append(region)
        names[normalized(name)] = region
    zip_codes = postal.get((parent['id'], normalized(ward['name']['local'])), set())
    grouped[('VN', region['code'])][ward['name']['local']].update(zip_codes)
    # Preserve the user's legacy Hai Duong address option. Vietnam Post assigned
    # postal prefix 03 to this area; current records are under Hai Phong.
    if name == 'Hải Phòng':
        legacy_codes = {code for code in zip_codes if code.startswith('03')}
        if legacy_codes:
            grouped[('VN', 'HD')][ward['name']['local']].update(legacy_codes)

output = root / 'frontend/public/address-data'
for (country_code, region_code), cities in grouped.items():
    region = next(r for r in by_code[country_code]['provinces'] if r['code'] == region_code)
    relative = f'{country_code}/{region_code}.json'
    region['locations_file'] = relative
    path = output / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({'country_code': country_code, 'province_code': region_code,
        'cities': [{'name': name, 'zip_codes': sorted(zips)} for name, zips in sorted(cities.items())]},
        ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')

target = root / 'shared/checkout-geography.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({'version': 1, 'countries': countries}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'Generated {len(countries)} countries and {len(grouped)} province locality files')
