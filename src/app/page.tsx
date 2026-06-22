'use client';
import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin,
  Navigation,
  RotateCcw,
  Compass,
  Search,
  BarChart3,
  Download,
  Map as MapIcon,
  List,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Sun,
  Moon,
  SlidersHorizontal,
  X
} from 'lucide-react';

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
}

interface Stats {
  villagesCount: number;
  postcodesCount: number;
  districtsCount: number;
  regenciesCount: number;
}

interface RouteOption {
  distance: number;
  duration: number;
  coordinates: [number, number][];
  summary: string;
}

// Import Map component dynamically to prevent SSR errors
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

// Default constants: Topsell Bhayangkara Mojokerto
const DEFAULT_LAT = -7.471691811269935;
const DEFAULT_LON = 112.4371506546873;
const DEFAULT_RADIUS = 20;

type SortField = 'distance' | 'postalCode' | 'village' | 'district' | 'regency';
type SortOrder = 'asc' | 'desc';

export default function Home() {
  // State
  const [storeLat, setStoreLat] = useState<number>(DEFAULT_LAT);
  const [storeLng, setStoreLng] = useState<number>(DEFAULT_LON);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showOutsideMarkers, setShowOutsideMarkers] = useState<boolean>(true);
  
  // Data State
  const [filteredRecords, setFilteredRecords] = useState<PostalCodeItem[]>([]);
  const [outsideRecords, setOutsideRecords] = useState<PostalCodeItem[]>([]);
  const [stats, setStats] = useState<Stats>({
    villagesCount: 0,
    postcodesCount: 0,
    districtsCount: 0,
    regenciesCount: 0
  });

  // UI State
  const [selectedRecord, setSelectedRecord] = useState<PostalCodeItem | null>(null);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [roadDistance, setRoadDistance] = useState<string | null>(null);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState<number>(0);
  const [defaultRoutePreference, setDefaultRoutePreference] = useState<'shortest' | 'middle' | 'longest'>('shortest');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [theme, setTheme] = useState<string>('dark');
  const [distanceMethod, setDistanceMethod] = useState<'geodesic' | 'road'>('road');
  const [showMobileControls, setShowMobileControls] = useState<boolean>(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTimeout(() => {
      setTheme(savedTheme);
    }, 0);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentSortField, setCurrentSortField] = useState<SortField>('distance');
  const [currentSortOrder, setCurrentSortOrder] = useState<SortOrder>('asc');

  // Debounced search term
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch data from API when coordinates, radius or search changes
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/postal-codes?lat=${storeLat}&lng=${storeLng}&radius=${radiusKm}&search=${encodeURIComponent(
            debouncedSearch
          )}&mode=${distanceMethod}`
        );
        const data = await res.json();
        if (data.success) {
          setFilteredRecords(data.filteredRecords || []);
          setOutsideRecords(data.outsideRecords || []);
          setStats(data.stats || {
            villagesCount: 0,
            postcodesCount: 0,
            districtsCount: 0,
            regenciesCount: 0
          });
          setCurrentPage(1); // Reset page on new fetch
        }
      } catch (err) {
        console.error('Failed to fetch data', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [storeLat, storeLng, radiusKm, debouncedSearch, distanceMethod]);

  // Reset function
  const handleReset = () => {
    setStoreLat(DEFAULT_LAT);
    setStoreLng(DEFAULT_LON);
    setRadiusKm(DEFAULT_RADIUS);
    setSelectedRecord(null);
    setRoutePath([]);
    setRoadDistance(null);
    setRouteOptions([]);
    setActiveRouteIndex(0);
  };

  // OSRM Routing handler
  const handleFetchRoute = async (item: PostalCodeItem) => {
    setSelectedRecord(item);
    setRoadDistance('Menghitung...');
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${item.longitude},${item.latitude}?overview=full&geometries=geojson&alternatives=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const parsedRoutes = data.routes.map((r: any) => {
          const distanceKm = parseFloat((r.distance / 1000).toFixed(2));
          const durationMin = parseFloat((r.duration / 60).toFixed(1));
          const coords: [number, number][] = r.geometry.coordinates.map((pt: [number, number]) => [pt[1], pt[0]]);
          const summary = r.legs?.[0]?.summary || 'Jalan Raya';
          return {
            distance: distanceKm,
            duration: durationMin,
            coordinates: coords,
            summary
          };
        }).sort((a: any, b: any) => a.distance - b.distance);

        let targetIdx = 0;
        if (defaultRoutePreference === 'longest') {
          targetIdx = parsedRoutes.length - 1;
        } else if (defaultRoutePreference === 'middle') {
          targetIdx = Math.floor(parsedRoutes.length / 2);
        }

        setRouteOptions(parsedRoutes);
        setActiveRouteIndex(targetIdx);
        setRoadDistance(parsedRoutes[targetIdx].distance.toFixed(2));
        setRoutePath(parsedRoutes[targetIdx].coordinates);
      } else {
        setRoadDistance('Gagal mendapatkan rute');
        setRoutePath([]);
        setRouteOptions([]);
        setActiveRouteIndex(0);
      }
    } catch (err) {
      console.error('Error fetching OSRM route:', err);
      setRoadDistance('Error rute');
      setRoutePath([]);
      setRouteOptions([]);
      setActiveRouteIndex(0);
    }
  };

  // Sorting logic
  const handleSort = (field: SortField) => {
    if (currentSortField === field) {
      setCurrentSortOrder(currentSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setCurrentSortField(field);
      setCurrentSortOrder('asc');
    }
  };

  const sortedRecords = useMemo(() => {
    const sorted = [...filteredRecords];
    sorted.sort((a, b) => {
      let valA = a[currentSortField];
      let valB = b[currentSortField];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;
      
      if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredRecords, currentSortField, currentSortOrder]);

  // Pagination logic
  const paginatedRecords = useMemo(() => {
    if (pageSize === -1) return sortedRecords;
    const startIdx = (currentPage - 1) * pageSize;
    return sortedRecords.slice(startIdx, startIdx + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.ceil(sortedRecords.length / pageSize);
  }, [sortedRecords, pageSize]);

  // Export functions using dynamic client-side libraries
  const handleExportCSV = () => {
    if (sortedRecords.length === 0) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }

    let csvContent = "\ufeff";
    csvContent += "No,Kode Pos,Kelurahan/Desa,Kecamatan,Kabupaten/Kota,Jarak Udara (km),Status Jangkauan,Latitude,Longitude,Link Google Maps\n";

    sortedRecords.forEach((item, index) => {
      const gmapsLink = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
      const statusText = item.isPartial ? "Sebagian Tercover" : "Penuh Tercover";
      const row = [
        index + 1,
        `"${item.postalCode}"`,
        `"${item.village}"`,
        `"${item.district}"`,
        `"${item.regency}"`,
        item.distance,
        `"${statusText}"`,
        item.latitude,
        item.longitude,
        `"${gmapsLink}"`
      ];
      csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Jangkauan_NextJS_Radius_${radiusKm}km.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = async () => {
    if (sortedRecords.length === 0) {
      alert("Tidak ada data untuk diekspor!");
      return;
    }

    // Load SheetJS dynamically to keep initial bundle small
    const XLSX = await import('xlsx');
    
    const dataForSheet = sortedRecords.map((item, index) => {
      const gmapsLink = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
      return {
        "No": index + 1,
        "Kode Pos": item.postalCode,
        "Kelurahan/Desa": item.village,
        "Kecamatan": item.district,
        "Kabupaten/Kota": item.regency,
        "Jarak Udara (km)": item.distance,
        "Status Cakupan": item.isPartial ? "Sebagian" : "Penuh",
        "Latitude": item.latitude,
        "Longitude": item.longitude,
        "Verifikasi Rute (Google Maps)": gmapsLink
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataForSheet);

    ws["!cols"] = [
      { wch: 6 },   // No
      { wch: 10 },  // Kode Pos
      { wch: 25 },  // Kelurahan
      { wch: 22 },  // Kecamatan
      { wch: 22 },  // Kabupaten
      { wch: 16 },  // Jarak
      { wch: 18 },  // Status Cakupan
      { wch: 14 },  // Latitude
      { wch: 14 },  // Longitude
      { wch: 60 }   // Google Maps Link
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Daftar Jangkauan");
    XLSX.writeFile(wb, `Jangkauan_NextJS_Radius_${radiusKm}km.xlsx`);
  };

  // Helper render for Sidebar content so it can be shared between desktop sidebar and mobile dropdown
  const renderSidebarControls = () => (
    <div className="flex flex-col gap-6">
      {/* Active Route Details (if any selected) */}
      {selectedRecord && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 p-4 bg-primary/5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Navigation size={13} className="animate-pulse" /> Rute Aktif
            </label>
            <button 
              onClick={() => {
                setSelectedRecord(null);
                setRoutePath([]);
                setRoadDistance(null);
                setRouteOptions([]);
                setActiveRouteIndex(0);
              }}
              className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
              title="Bersihkan Rute"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-foreground truncate">{selectedRecord.village} ({selectedRecord.postalCode})</span>
            <span className="text-[10px] text-muted-foreground truncate">Kec. {selectedRecord.district}, {selectedRecord.regency}</span>
          </div>
          
          <div className="flex items-center justify-between border-t border-border/40 pt-2">
            <span className="text-xs text-muted-foreground">Jarak Rute:</span>
            <span className="text-sm font-extrabold text-primary">{roadDistance ? `${roadDistance} km` : 'Menghitung...'}</span>
          </div>

          {/* Alternative selections inside sidebar */}
          {routeOptions.length > 1 && (
            <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Opsi Alternatif Rute:</span>
              <div className="flex flex-col gap-1.5">
                {routeOptions.map((opt, idx) => {
                  let label = `Alternatif ${idx + 1}`;
                  if (idx === 0) label = "Terdekat";
                  else if (idx === routeOptions.length - 1) label = "Terjauh";
                  else label = "Tengah/Alternatif";
                  
                  const isRouteActive = idx === activeRouteIndex;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setActiveRouteIndex(idx);
                        setRoadDistance(opt.distance.toFixed(2));
                        setRoutePath(opt.coordinates);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all border ${
                        isRouteActive
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-background hover:bg-accent border-input text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="truncate mr-2">{label}</span>
                      <span className="font-mono text-[10px] shrink-0">{opt.distance} km</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Location Configuration */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Navigation size={14} className="text-foreground" /> Koordinat Toko Pusat
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Latitude</span>
            <input 
              type="number" 
              step="any" 
              value={storeLat} 
              onChange={(e) => setStoreLat(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase">Longitude</span>
            <input 
              type="number" 
              step="any" 
              value={storeLng}
              onChange={(e) => setStoreLng(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <button 
          onClick={handleReset} 
          className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-2 mt-1"
        >
          <RotateCcw size={12} /> Reset ke Toko Pusat
        </button>
      </div>

      {/* Distance Calculation Method */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Compass size={14} className="text-foreground" /> Metode Hitung Jarak
        </label>
        <div className="grid grid-cols-2 gap-2 bg-muted p-1 rounded-lg">
          <button 
            type="button"
            onClick={() => setDistanceMethod('road')} 
            className={`inline-flex items-center justify-center rounded-md text-xs font-semibold py-1.5 transition-all ${
              distanceMethod === 'road' 
                ? 'bg-card text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Jarak Jalan (Pas)
          </button>
          <button 
            type="button"
            onClick={() => setDistanceMethod('geodesic')} 
            className={`inline-flex items-center justify-center rounded-md text-xs font-semibold py-1.5 transition-all ${
              distanceMethod === 'geodesic' 
                ? 'bg-card text-foreground shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Jarak Udara (Lurus)
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {distanceMethod === 'road' 
            ? 'Jarak jalan darat aktual menggunakan OSRM API (optimal untuk pengiriman kurir).' 
            : 'Jarak udara garis lurus kompas langsung (lebih cepat, estimasi kasar).'}
        </p>
        
        {/* Default Route Option Preference */}
        {distanceMethod === 'road' && (
          <div className="flex flex-col gap-1.5 border-t border-border/40 pt-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Prioritas Rute Default</span>
            <select 
              value={defaultRoutePreference}
              onChange={(e) => setDefaultRoutePreference(e.target.value as any)}
              className="h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer font-semibold"
            >
              <option value="shortest">Rute Terdekat</option>
              <option value="middle">Rute Tengah / Alternatif</option>
              <option value="longest">Rute Terjauh</option>
            </select>
          </div>
        )}
      </div>
      
      {/* Radius Configuration */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Compass size={14} className="text-foreground" /> Radius Maksimal
          </label>
          <span className="text-xs font-bold bg-accent text-accent-foreground px-2 py-0.5 rounded border border-border">{radiusKm} km</span>
        </div>
        <input 
          type="range" 
          min="1" 
          max="50" 
          value={radiusKm} 
          onChange={(e) => setRadiusKm(parseInt(e.target.value))}
          className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-foreground"
        />
        <p className="text-[11px] text-muted-foreground">Rentang jangkauan: 1 km s.d 50 km</p>
      </div>

      {/* Map Visual Toggle */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <MapIcon size={14} className="text-foreground" /> Filter Visual Peta
        </label>
        <label className="inline-flex items-center gap-2.5 cursor-pointer text-sm text-foreground select-none">
          <input 
            type="checkbox" 
            checked={showOutsideMarkers}
            onChange={(e) => setShowOutsideMarkers(e.target.checked)}
            className="rounded border-input text-primary focus:ring-ring h-4 w-4 bg-transparent cursor-pointer"
          />
          <span>Tampilkan Area Sebagian (Luar Radius)</span>
        </label>
      </div>
      
      {/* Real-time Search */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Search size={14} className="text-foreground" /> Pencarian Real-time
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Cari Kode Pos, Desa, Kecamatan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      
      {/* Live Statistics */}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-muted/30">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 size={14} className="text-foreground" /> Ringkasan Area Tercover
        </label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="flex flex-col border border-border p-2.5 rounded-md bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-lg font-bold tracking-tight">{stats.villagesCount.toLocaleString('id-ID')}</span>
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">Kelurahan/Desa</span>
          </div>
          <div className="flex flex-col border border-border p-2.5 rounded-md bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-lg font-bold tracking-tight">{stats.postcodesCount.toLocaleString('id-ID')}</span>
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">Kode Pos</span>
          </div>
          <div className="flex flex-col border border-border p-2.5 rounded-md bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-lg font-bold tracking-tight">{stats.districtsCount.toLocaleString('id-ID')}</span>
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">Kecamatan</span>
          </div>
          <div className="flex flex-col border border-border p-2.5 rounded-md bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-lg font-bold tracking-tight">{stats.regenciesCount.toLocaleString('id-ID')}</span>
            <span className="text-[9px] text-muted-foreground uppercase font-semibold">Kabupaten/Kota</span>
          </div>
        </div>
      </div>
      
      {/* Export Panel */}
      <div className="flex flex-col gap-2 pt-4 border-t border-border">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-1">
          <Download size={14} className="text-foreground" /> Ekspor Jangkauan
        </label>
        <button 
          onClick={handleExportExcel} 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 gap-2 w-full"
        >
          <FileSpreadsheet size={15} /> Ekspor ke Excel (.xlsx)
        </button>
        <button 
          onClick={handleExportCSV} 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 gap-2 w-full"
        >
          <FileText size={15} /> Ekspor ke CSV (.csv)
        </button>
        <a href="https://choliltopsell.github.io/generator">
          <button 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 gap-2 w-full"
          >
            Kembali ke Generator
          </button>
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[380px_1fr] min-h-screen bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar Controls - Desktop view only */}
      <aside className="hidden lg:flex flex-col h-screen border-r border-border bg-card shrink-0 sticky top-0 overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
              <MapPin size={20} />
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-base leading-none">Area Ongkir</h1>
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Next.js + JSON Local</span>
            </div>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8"
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
        
        <div className="p-6 grow">
          {renderSidebarControls()}
        </div>
        
        <div className="p-4 border-t border-border bg-muted/10 text-center text-[10px] text-muted-foreground flex flex-col gap-0.5">
          <p className="font-medium">Next.js Local Engine &bull; Mojokerto</p>
          <p>&copy; Topsell Dev &bull; Antigravity AI</p>
        </div>
      </aside>

      {/* Mobile Top Navbar */}
      <header className="flex lg:hidden items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <MapPin size={16} />
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-sm">Area Ongkir</h1>
            <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider block">Mojokerto 20km</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMobileControls(!showMobileControls)}
            className="inline-flex items-center justify-center rounded-md text-xs font-semibold border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-1.5"
          >
            <SlidersHorizontal size={13} /> {showMobileControls ? 'Tutup' : 'Kontrol'}
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* Mobile Collapsible Control Panel Drawer */}
      {showMobileControls && (
        <div className="lg:hidden bg-card border-b border-border p-4 flex flex-col gap-4 shadow-md max-h-[80vh] overflow-y-auto z-40 sticky top-[57px]">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-1">
            <h3 className="font-bold text-sm flex items-center gap-1.5"><SlidersHorizontal size={14} /> Kontrol & Penyaringan</h3>
            <button 
              onClick={() => setShowMobileControls(false)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X size={16} />
            </button>
          </div>
          {renderSidebarControls()}
        </div>
      )}
      
      {/* Main Content Area */}
      <main className="grow p-4 md:p-8 flex flex-col gap-6 overflow-x-hidden">
        
        {/* Map Section */}
        <section className="flex flex-col gap-4 rounded-xl border border-border p-4 md:p-6 bg-card shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg tracking-tight flex items-center gap-2">
                  <MapIcon size={18} className="text-muted-foreground" /> Peta Wilayah Jangkauan
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500 border border-emerald-500/20">
                  {distanceMethod === 'road' ? 'Jarak Darat (OSRM)' : 'Jarak Udara (Geodesic)'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <AlertCircle size={13} className="text-amber-500 shrink-0" />
                <span>Geser penanda <span className="font-semibold text-destructive">Merah</span> untuk memindahkan pusat toko.</span>
              </p>
            </div>
          </div>
          
          {/* OSRM Route Info Panel (Appears when route is active) */}
          {selectedRecord && (
            <div className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-muted/40 shadow-[0_1px_2px_rgba(0,0,0,0.02)] animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <h4 className="text-xs font-bold text-foreground">Rute Terpilih: {selectedRecord.village} ({selectedRecord.postalCode})</h4>
                  <p className="text-[11px] text-muted-foreground">Kec. {selectedRecord.district}, {selectedRecord.regency}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] text-muted-foreground">Jarak Rute Darat:</span>
                    <strong className="text-sm font-bold text-emerald-500">{roadDistance ? `${roadDistance} km` : 'Menghitung...'}</strong>
                    <span className="text-[9px] text-muted-foreground">
                      {distanceMethod === 'road' ? `(Jarak Database: ${selectedRecord.distance} km)` : `(Jarak Udara: ${selectedRecord.distance} km)`}
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedRecord(null);
                      setRoutePath([]);
                      setRoadDistance(null);
                      setRouteOptions([]);
                      setActiveRouteIndex(0);
                    }}
                    className="text-muted-foreground hover:text-foreground p-1 hover:bg-accent rounded transition-colors"
                    title="Hapus Rute"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Alternative Route Choices */}
              {routeOptions.length > 1 && (
                <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pilihan Rute Alternatif (OSRM):</span>
                  <div className="flex flex-wrap gap-2">
                    {routeOptions.map((opt, idx) => {
                      let label = `Alternatif ${idx + 1}`;
                      if (idx === 0) label = "Terdekat";
                      else if (idx === routeOptions.length - 1) label = "Terjauh";
                      else label = "Tengah/Alternatif";

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveRouteIndex(idx);
                            setRoadDistance(opt.distance.toFixed(2));
                            setRoutePath(opt.coordinates);
                          }}
                          className={`inline-flex items-center justify-center rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                            idx === activeRouteIndex
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-background hover:bg-accent border border-input text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label} ({opt.distance} km - {opt.summary})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="h-[340px] md:h-[400px] w-full rounded-lg overflow-hidden border border-border shadow-sm bg-muted/20 relative z-10">
            <Map 
              theme={theme}
              storeLat={storeLat}
              storeLng={storeLng}
              radiusKm={radiusKm}
              filteredRecords={filteredRecords}
              outsideRecords={outsideRecords}
              showOutsideMarkers={showOutsideMarkers}
              onMarkerDrag={(lat: number, lng: number) => {
                setStoreLat(parseFloat(lat.toFixed(6)));
                setStoreLng(parseFloat(lng.toFixed(6)));
              }}
              onMarkerDragEnd={() => {}}
              onMapDoubleClick={(lat: number, lng: number) => {
                setStoreLat(parseFloat(lat.toFixed(6)));
                setStoreLng(parseFloat(lng.toFixed(6)));
              }}
              selectedRecord={selectedRecord}
              routePath={routePath}
              onSelectRecord={handleFetchRoute}
            />
          </div>
        </section>
        
        {/* Table Section */}
        <section className="flex flex-col gap-4 rounded-xl border border-border p-4 md:p-6 bg-card shadow-sm grow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="font-bold text-lg tracking-tight flex items-center gap-2">
                <List size={18} className="text-muted-foreground" /> Daftar Area Terfilter
              </h2>
              <span className="inline-flex items-center rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-xs font-semibold border border-border">
                {sortedRecords.length.toLocaleString('id-ID')} data
              </span>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Tampilkan</span>
              <select 
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value === 'all' ? -1 : parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 rounded-md border border-input bg-transparent px-2.5 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer font-medium"
              >
                <option value="10">10 baris</option>
                <option value="25">25 baris</option>
                <option value="50">50 baris</option>
                <option value="100">100 baris</option>
                <option value="all">Semua data</option>
              </select>
            </div>
          </div>
          
          <div className="w-full overflow-x-auto rounded-lg border border-border shadow-sm bg-background">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 transition-colors">
                  <th className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[60px]">No</th>
                  <th 
                    className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[120px] cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('postalCode')}
                  >
                    <div className="flex items-center gap-1.5">
                      Kode Pos <ChevronsUpDown size={11} className="text-muted-foreground/60" />
                    </div>
                  </th>
                  <th 
                    className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('village')}
                  >
                    <div className="flex items-center gap-1.5">
                      Kelurahan / Desa <ChevronsUpDown size={11} className="text-muted-foreground/60" />
                    </div>
                  </th>
                  <th 
                    className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('district')}
                  >
                    <div className="flex items-center gap-1.5">
                      Kecamatan <ChevronsUpDown size={11} className="text-muted-foreground/60" />
                    </div>
                  </th>
                  <th 
                    className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('regency')}
                  >
                    <div className="flex items-center gap-1.5">
                      Kabupaten / Kota <ChevronsUpDown size={11} className="text-muted-foreground/60" />
                    </div>
                  </th>
                  <th 
                    className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[130px] cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('distance')}
                  >
                    <div className="flex items-center gap-1.5">
                      {distanceMethod === 'road' ? 'Jarak Rute' : 'Jarak Udara'}{' '}
                      {currentSortField === 'distance' ? (
                        currentSortOrder === 'asc' ? <ChevronUp size={11} className="text-foreground" /> : <ChevronDown size={11} className="text-foreground" />
                      ) : (
                        <ChevronsUpDown size={11} className="text-muted-foreground/60" />
                      )}
                    </div>
                  </th>
                  <th className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[150px]">Status</th>
                  <th className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px]">Koordinat</th>
                  <th className="h-10 px-4 align-middle text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px] text-center">Google Maps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedRecords.map((item, index) => {
                  const rowNum = pageSize === -1 ? index + 1 : (currentPage - 1) * pageSize + index + 1;
                  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
                  const isActive = selectedRecord && selectedRecord.village === item.village && selectedRecord.postalCode === item.postalCode;
                  
                  return (
                    <tr 
                      key={`${item.postalCode}-${item.village}`}
                      onClick={() => handleFetchRoute(item)}
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${
                        isActive ? 'bg-accent/80 font-medium border-l-2 border-l-primary' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-muted-foreground text-xs">{rowNum}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs border border-border px-1.5 py-0.5 rounded bg-muted/30 text-foreground font-semibold">
                          {item.postalCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{item.village}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.district}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.regency}</td>
                      <td className="px-4 py-3 font-bold text-primary">{item.distance} km</td>
                      <td className="px-4 py-3">
                        {item.isPartial ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full" title="Sebagian desa di wilayah ini berada di luar radius.">
                            <AlertTriangle size={10} /> Sebagian
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full" title="Seluruh desa di wilayah ini berada di dalam radius.">
                            <CheckCircle size={10} /> Penuh
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <a 
                          href={gmapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1 text-[11px] font-semibold border border-input rounded-md px-2.5 py-1 bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <ExternalLink size={10} /> Rute
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredRecords.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground/60 mb-3" />
                <h3 className="font-bold text-sm text-foreground">Data tidak ditemukan</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">Tidak ada kode pos atau kelurahan dalam radius tersebut yang cocok dengan kata kunci pencarian Anda.</p>
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-3"></div>
                <h3 className="font-medium text-sm text-foreground">Memuat data...</h3>
              </div>
            )}
          </div>
          
          {/* Table Pagination */}
          {pageSize !== -1 && sortedRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
              <span className="text-xs text-muted-foreground text-center sm:text-left">
                Menampilkan <b>{Math.min((currentPage - 1) * pageSize + 1, sortedRecords.length)}</b> -{' '}
                <b>{Math.min(currentPage * pageSize, sortedRecords.length)}</b> dari <b>{sortedRecords.length}</b> data
              </span>
              <div className="flex items-center justify-center gap-1.5">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={13} /> Sblm
                </button>
                
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxPagesToShow = 5;
                    let start = Math.max(1, currentPage - 2);
                    let end = Math.min(totalPages, start + maxPagesToShow - 1);
                    
                    if (end - start + 1 < maxPagesToShow) {
                      start = Math.max(1, end - maxPagesToShow + 1);
                    }
                    
                    for (let p = start; p <= end; p++) {
                      pages.push(p);
                    }
                    
                    return pages.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`inline-flex items-center justify-center rounded-md text-xs font-semibold h-8 w-8 transition-colors ${
                          pageNum === currentPage 
                            ? 'bg-primary text-primary-foreground shadow' 
                            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={currentPage === totalPages}
                >
                  Sldt <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
