import fs from 'fs';
import path from 'path';
import { NextResponse, NextRequest } from 'next/server';

interface PostalCodeRawItem {
  c: string | number;
  v: string;
  d: string;
  r: string;
  lat: number;
  lng: number;
}

interface PostalCodeItem {
  postalCode: string;
  village: string;
  district: string;
  regency: string;
  latitude: number;
  longitude: number;
  distance: number;
  isPartial?: boolean;
  cpInside?: number;
  cpTotal?: number;
  dtInside?: number;
  dtTotal?: number;
  isRoad?: boolean;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchRoadDistances(
  storeLat: number,
  storeLng: number,
  destinations: { latitude: number; longitude: number }[]
): Promise<(number | null)[]> {
  if (destinations.length === 0) return [];

  const coordsString = [
    `${storeLng},${storeLat}`,
    ...destinations.map(d => `${d.longitude},${d.latitude}`)
  ].join(';');

  const url = `https://router.project-osrm.org/table/v1/driving/${coordsString}?sources=0&annotations=distance`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM API responded with status ${response.status}`);
    }
    const data = await response.json();
    if (data.code === 'Ok' && data.distances && data.distances[0]) {
      return data.distances[0].slice(1).map((dist: number | null) => {
        if (dist === null) return null;
        return parseFloat((dist / 1000).toFixed(3)); // convert to km
      });
    } else {
      throw new Error(`OSRM API returned error code ${data.code}`);
    }
  } catch (error) {
    console.error('OSRM Table API fetch error:', error);
    return destinations.map(() => null); // fallback to nulls
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeLat = parseFloat(searchParams.get('lat') || '-7.471691811269935');
    const storeLng = parseFloat(searchParams.get('lng') || '112.4371506546873');
    const radiusKm = parseFloat(searchParams.get('radius') || '20');
    const search = searchParams.get('search') || '';
    const mode = searchParams.get('mode') || 'road'; // default to 'road' as requested

    // Read the local JSON file
    const filePath = path.join(process.cwd(), 'kodepos_jatim.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'kodepos_jatim.json not found' }, { status: 400 });
    }
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const KODEPOS_DATA: PostalCodeRawItem[] = JSON.parse(fileContent);

    // Hitung jarak geodesic awal untuk seluruh dataset Jawa Timur
    const calculated: PostalCodeItem[] = KODEPOS_DATA.map((item) => {
      const geodesicDistance = calculateDistance(storeLat, storeLng, item.lat, item.lng);
      return {
        postalCode: String(item.c),
        village: item.v,
        district: item.d,
        regency: item.r,
        latitude: item.lat,
        longitude: item.lng,
        distance: parseFloat(geodesicDistance.toFixed(3)),
      };
    });

    // Jika mode === 'road', hitung jarak darat menggunakan OSRM Table Service
    if (mode === 'road') {
      // Pre-filter: kueri OSRM hanya untuk kandidat yang jarak geodesic-nya <= radiusKm
      const candidates = calculated.filter(item => item.distance <= radiusKm);
      
      if (candidates.length > 0) {
        const BATCH_SIZE = 80;
        const batches: PostalCodeItem[][] = [];
        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
          batches.push(candidates.slice(i, i + BATCH_SIZE));
        }

        const batchPromises = batches.map(batch => 
          fetchRoadDistances(storeLat, storeLng, batch.map(c => ({ latitude: c.latitude, longitude: c.longitude })))
        );
        const batchResults = await Promise.all(batchPromises);
        const roadDistances = batchResults.flat();

        const candidateMap = new Map<string, number>();
        candidates.forEach((item, idx) => {
          const roadDist = roadDistances[idx];
          if (roadDist !== null) {
            candidateMap.set(`${item.postalCode}-${item.village}`, roadDist);
          }
        });

        calculated.forEach(item => {
          const key = `${item.postalCode}-${item.village}`;
          if (candidateMap.has(key)) {
            item.distance = candidateMap.get(key)!;
            item.isRoad = true;
          } else {
            item.isRoad = false;
          }
        });
      }
    }

    // Hitung total desa per Kode Pos dan Kecamatan di database
    const pcTotalMap: Record<string, number> = {};
    const dtTotalMap: Record<string, number> = {};
    calculated.forEach((item) => {
      const cp = item.postalCode;
      const dtKey = `${item.district}|${item.regency}`;

      pcTotalMap[cp] = (pcTotalMap[cp] || 0) + 1;
      dtTotalMap[dtKey] = (dtTotalMap[dtKey] || 0) + 1;
    });

    // 1. Saring kelurahan yang berada di dalam radius (baik geodesic maupun road)
    const allWithinRadius = calculated.filter((item) => item.distance <= radiusKm);

    // 2. Hitung jumlah kelurahan di dalam radius per Kode Pos dan Kecamatan
    const pcInsideMap: Record<string, number> = {};
    const dtInsideMap: Record<string, number> = {};
    allWithinRadius.forEach((item) => {
      const cp = item.postalCode;
      const dtKey = `${item.district}|${item.regency}`;

      pcInsideMap[cp] = (pcInsideMap[cp] || 0) + 1;
      dtInsideMap[dtKey] = (dtInsideMap[dtKey] || 0) + 1;
    });

    // 3. Tandai status cakupan (Penuh/Sebagian)
    const transformedInside: PostalCodeItem[] = allWithinRadius.map((item) => {
      const cp = item.postalCode;
      const dtKey = `${item.district}|${item.regency}`;

      const cpInside = pcInsideMap[cp] || 0;
      const cpTotal = pcTotalMap[cp] || 1;
      const dtInside = dtInsideMap[dtKey] || 0;
      const dtTotal = dtTotalMap[dtKey] || 1;

      const isCpPartial = cpInside > 0 && cpInside < cpTotal;
      const isDtPartial = dtInside > 0 && dtInside < dtTotal;

      return {
        ...item,
        isPartial: isCpPartial || isDtPartial,
        cpInside,
        cpTotal,
        dtInside,
        dtTotal,
      };
    });

    // 4. Saring berdasarkan kata kunci pencarian
    let filteredInside = transformedInside;
    if (search.trim() !== '') {
      const query = search.toLowerCase().trim();
      filteredInside = transformedInside.filter(
        (item) =>
          item.postalCode.includes(query) ||
          item.village.toLowerCase().includes(query) ||
          item.district.toLowerCase().includes(query) ||
          item.regency.toLowerCase().includes(query)
      );
    }

    // 5. Kumpulkan data kelurahan di luar radius yang termasuk cakupan sebagian
    const partialPostalCodes = new Set<string>();
    const partialDistricts = new Set<string>();
    for (const cp in pcInsideMap) {
      if (pcInsideMap[cp] < pcTotalMap[cp]) {
        partialPostalCodes.add(cp);
      }
    }
    for (const dtKey in dtInsideMap) {
      if (dtInsideMap[dtKey] < dtTotalMap[dtKey]) {
        partialDistricts.add(dtKey);
      }
    }

    const outsideRecords: PostalCodeItem[] = [];
    if (partialPostalCodes.size > 0 || partialDistricts.size > 0) {
      const insideSet = new Set(allWithinRadius.map((v) => `${v.postalCode}-${v.village}`));

      calculated.forEach((item) => {
        const cp = item.postalCode;
        const dtKey = `${item.district}|${item.regency}`;

        const isOutside = !insideSet.has(`${cp}-${item.village}`);
        if (isOutside) {
          const inPartialCp = partialPostalCodes.has(cp);
          const inPartialDt = partialDistricts.has(dtKey);

          if (inPartialCp || inPartialDt) {
            outsideRecords.push({
              ...item,
              isPartial: true,
            });
          }
        }
      });
    }

    // Hitung Ringkasan Statistik unik (berdasarkan seluruh kelurahan di dalam radius)
    const uniquePostcodes = new Set<string>();
    const uniqueDistricts = new Set<string>();
    const uniqueRegencies = new Set<string>();
    transformedInside.forEach((item) => {
      uniquePostcodes.add(item.postalCode);
      uniqueDistricts.add(`${item.district}-${item.regency}`);
      uniqueRegencies.add(item.regency);
    });

    const stats = {
      villagesCount: transformedInside.length,
      postcodesCount: uniquePostcodes.size,
      districtsCount: uniqueDistricts.size,
      regenciesCount: uniqueRegencies.size,
    };

    return NextResponse.json({
      success: true,
      filteredRecords: filteredInside,
      outsideRecords,
      stats,
    });
  } catch (error: any) {
    console.error('Postal codes error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
