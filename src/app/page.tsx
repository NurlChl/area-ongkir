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
  Moon
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [theme, setTheme] = useState<string>('dark');
  const [distanceMethod, setDistanceMethod] = useState<'geodesic' | 'road'>('road');

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
  };

  // OSRM Routing handler
  const handleFetchRoute = async (item: PostalCodeItem) => {
    setSelectedRecord(item);
    setRoadDistance('Menghitung...');
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${item.longitude},${item.latitude}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        setRoadDistance((route.distance / 1000).toFixed(2));
        
        // Convert OSRM points [lng, lat] to Leaflet points [lat, lng]
        const coords: [number, number][] = route.geometry.coordinates.map((pt: [number, number]) => [pt[1], pt[0]]);
        setRoutePath(coords);
      } else {
        setRoadDistance('Gagal mendapatkan rute');
        setRoutePath([]);
      }
    } catch (err) {
      console.error('Error fetching OSRM route:', err);
      setRoadDistance('Error rute');
      setRoutePath([]);
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

  return (
    <div className="app-container">
      {/* Sidebar Controls */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="logo-container">
            <i className="logo-icon"><MapPin size={32} /></i>
            <div>
              <h1>Area Ongkir</h1>
              <span className="subtitle">Next.js + JSON Local</span>
            </div>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="btn-secondary"
            style={{ padding: '8px', borderRadius: '50%', width: '36px', height: '36px', flexShrink: 0 }}
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        
        <div className="sidebar-content">

          {/* Location Configuration */}
          <div className="control-group">
            <label className="group-title"><Navigation size={16} /> Koordinat Toko Pusat</label>
            <div className="input-grid">
              <div className="input-field">
                <label htmlFor="input-lat">Latitude</label>
                <input 
                  type="number" 
                  id="input-lat" 
                  step="any" 
                  value={storeLat} 
                  onChange={(e) => setStoreLat(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="input-field">
                <label htmlFor="input-lng">Longitude</label>
                <input 
                  type="number" 
                  id="input-lng" 
                  step="any" 
                  value={storeLng}
                  onChange={(e) => setStoreLng(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="button-row" style={{ marginTop: '8px' }}>
              <button onClick={handleReset} className="btn-secondary" style={{ width: '100%' }}><RotateCcw size={14} /> Reset ke Topsell</button>
            </div>
          </div>

          {/* Distance Calculation Method */}
          <div className="control-group">
            <label className="group-title"><Navigation size={16} /> Metode Hitung Jarak</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              <button 
                type="button"
                onClick={() => setDistanceMethod('road')} 
                className={distanceMethod === 'road' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '11px', padding: '8px 4px', fontWeight: 700 }}
              >
                Jarak Jalan (Pas)
              </button>
              <button 
                type="button"
                onClick={() => setDistanceMethod('geodesic')} 
                className={distanceMethod === 'geodesic' ? 'btn-primary' : 'btn-secondary'}
                style={{ fontSize: '11px', padding: '8px 4px', fontWeight: 700 }}
              >
                Jarak Udara (Lurus)
              </button>
            </div>
            <span className="slider-helper">
              {distanceMethod === 'road' 
                ? 'Mengikuti jarak jalan darat nyata untuk pengiriman kurir.' 
                : 'Mengikuti jarak garis lurus kompas (geodesic).'}
            </span>
          </div>
          
          {/* Radius Configuration */}
          <div className="control-group">
            <div className="slider-header">
              <label className="group-title"><Compass size={16} /> Radius Maksimal</label>
              <span id="radius-val" className="slider-value">{radiusKm} km</span>
            </div>
            <input 
              type="range" 
              id="input-radius" 
              min="1" 
              max="50" 
              value={radiusKm} 
              onChange={(e) => setRadiusKm(parseInt(e.target.value))}
              className="slider"
            />
            <span className="slider-helper">Bisa digeser dari 1 km hingga 50 km</span>
          </div>

          {/* Map Visual Toggle */}
          <div className="control-group">
            <label className="group-title"><MapIcon size={16} /> Filter Visual Peta</label>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                id="toggle-outside-markers" 
                checked={showOutsideMarkers}
                onChange={(e) => setShowOutsideMarkers(e.target.checked)}
              />
              <span>Tampilkan Area Sebagian (Luar Radius)</span>
            </label>
          </div>
          
          {/* Real-time Search */}
          <div className="control-group">
            <label className="group-title" htmlFor="input-search"><Search size={16} /> Pencarian Real-time</label>
            <div className="search-box">
              <Search className="search-icon" size={16} />
              <input 
                type="text" 
                id="input-search" 
                placeholder="Cari Kode Pos, Desa, Kecamatan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Live Statistics */}
          <div className="control-group stats-card">
            <label className="group-title"><BarChart3 size={16} /> Ringkasan Area</label>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-val">{stats.villagesCount.toLocaleString('id-ID')}</span>
                <span className="stat-lbl">Kelurahan/Desa</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.postcodesCount.toLocaleString('id-ID')}</span>
                <span className="stat-lbl">Kode Pos Unik</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.districtsCount.toLocaleString('id-ID')}</span>
                <span className="stat-lbl">Kecamatan</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.regenciesCount.toLocaleString('id-ID')}</span>
                <span className="stat-lbl">Kabupaten/Kota</span>
              </div>
            </div>
          </div>
          
          {/* Export Panel */}
          <div className="control-group export-group">
            <label className="group-title"><Download size={16} /> Ekspor Jangkauan</label>
            <button onClick={handleExportExcel} className="btn-primary btn-excel"><FileSpreadsheet size={14} /> Ekspor ke Excel (.xlsx)</button>
            <button onClick={handleExportCSV} className="btn-secondary"><FileText size={14} /> Ekspor ke CSV (.csv)</button>
          </div>
        </div>
        
        <div className="sidebar-footer">
          <p>Next.js + JSON Local Engine</p>
          <p className="copyright">&copy; Topsell Dev &bull; Antigravity AI</p>
        </div>
      </aside>
      
      {/* Main Content Area */}
      <main className="main-content">
        {/* Map Section */}
        <section className="map-section">
          <div className="card-header">
            <div className="title-with-badge">
              <h2><MapIcon size={18} /> Peta Wilayah Jangkauan</h2>
              <span className="badge">{distanceMethod === 'road' ? 'Radius Jarak Darat' : 'Radius Jarak Udara'}</span>
            </div>
            <span className="info-text">
              <AlertCircle className="inline-icon" size={14} /> Geser penanda <span className="accent-text">Merah</span> di peta untuk mengubah lokasi toko. {distanceMethod === 'road' ? <>Penyaringan area saat ini menggunakan <b>Jarak Jalan Raya (OSRM)</b> nyata.</> : <>Jarak dihitung adalah <b>Jarak Udara (Garis Lurus)</b>. Rute jalan raya akan lebih jauh.</>}
            </span>
          </div>
          
          {/* OSRM Route Info Panel */}
          {selectedRecord && (
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius-md)',
              padding: '12px 16px',
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Rute Terpilih: {selectedRecord.village} ({selectedRecord.postalCode})</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Kec. {selectedRecord.district}, {selectedRecord.regency}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Jarak Rute Darat (OSRM API):</span>
                <strong style={{ fontSize: '16px', color: 'var(--accent-cyan)' }}>{roadDistance ? `${roadDistance} km` : 'Menghitung...'}</strong>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                  {distanceMethod === 'road' ? `(Jarak Jalan: ${selectedRecord.distance} km)` : `(Jarak Udara: ${selectedRecord.distance} km)`}
                </span>
              </div>
            </div>
          )}

          <div style={{ height: '360px', width: '100%', position: 'relative' }}>
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
            />
          </div>
        </section>
        
        {/* Table Section */}
        <section className="table-section">
          <div className="table-header">
            <div className="table-title">
              <h2><List size={18} /> Daftar Kode Pos Terfilter</h2>
              <span className="row-count">Menampilkan {sortedRecords.length.toLocaleString('id-ID')} data</span>
            </div>
            <div className="table-actions">
              <div className="select-field">
                <label htmlFor="select-limit">Tampilkan</label>
                <select 
                  id="select-limit"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(e.target.value === 'all' ? -1 : parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="10">10 baris</option>
                  <option value="25">25 baris</option>
                  <option value="50">50 baris</option>
                  <option value="100">100 baris</option>
                  <option value="all">Semua data</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="table-responsive">
            <table id="data-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>No</th>
                  <th style={{ width: '120px' }} className="sortable" onClick={() => handleSort('postalCode')}>
                    Kode Pos <i className="sort-icon"><ChevronsUpDown size={12} /></i>
                  </th>
                  <th className="sortable" onClick={() => handleSort('village')}>
                    Kelurahan / Desa <i className="sort-icon"><ChevronsUpDown size={12} /></i>
                  </th>
                  <th className="sortable" onClick={() => handleSort('district')}>
                    Kecamatan <i className="sort-icon"><ChevronsUpDown size={12} /></i>
                  </th>
                  <th className="sortable" onClick={() => handleSort('regency')}>
                    Kabupaten / Kota <i className="sort-icon"><ChevronsUpDown size={12} /></i>
                  </th>
                  <th style={{ width: '130px' }} className="sortable active-sort" onClick={() => handleSort('distance')}>
                    {distanceMethod === 'road' ? 'Jarak Rute' : 'Jarak Udara'} <i className="sort-icon">
                      {currentSortField === 'distance' ? (
                        currentSortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : <ChevronsUpDown size={12} />}
                    </i>
                  </th>
                  <th style={{ width: '150px' }}>Status Cakupan</th>
                  <th style={{ width: '180px' }}>Koordinat</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Google Map</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((item, index) => {
                  const rowNum = pageSize === -1 ? index + 1 : (currentPage - 1) * pageSize + index + 1;
                  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
                  const isActive = selectedRecord && selectedRecord.village === item.village && selectedRecord.postalCode === item.postalCode;
                  
                  return (
                    <tr 
                      key={`${item.postalCode}-${item.village}`}
                      className={isActive ? 'active-row' : ''}
                      onClick={() => handleFetchRoute(item)}
                    >
                      <td>{rowNum}</td>
                      <td><span className="postal-badge">{item.postalCode}</span></td>
                      <td className="bold-text">{item.village}</td>
                      <td>{item.district}</td>
                      <td>{item.regency}</td>
                      <td className="dist-col">{item.distance} km</td>
                      <td>
                        {item.isPartial ? (
                          <span className="badge-partial" title="Sebagian desa di wilayah ini berada di luar radius.">
                            <AlertTriangle size={12} /> Sebagian
                          </span>
                        ) : (
                          <span className="badge-full" title="Seluruh desa di wilayah ini berada di dalam radius.">
                            <CheckCircle size={12} /> Penuh
                          </span>
                        )}
                      </td>
                      <td className="coord-col">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <a 
                          href={gmapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn-gmaps"
                          onClick={(e) => e.stopPropagation()} // Prevent row click select when clicking link
                        >
                          <ExternalLink size={12} /> Rute Maps
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {filteredRecords.length === 0 && !isLoading && (
              <div id="no-data-msg" className="no-data-message">
                <AlertCircle className="no-data-icon" size={48} />
                <h3>Data tidak ditemukan</h3>
                <p>Tidak ada kode pos atau kelurahan dalam radius tersebut yang cocok dengan kata kunci pencarian Anda.</p>
              </div>
            )}

            {isLoading && (
              <div className="no-data-message">
                <h3>Memuat data...</h3>
              </div>
            )}
          </div>
          
          {/* Table Pagination */}
          {pageSize !== -1 && sortedRecords.length > 0 && (
            <div className="pagination-container">
              <span className="pagination-info">
                Menampilkan {Math.min((currentPage - 1) * pageSize + 1, sortedRecords.length)}-
                {Math.min(currentPage * pageSize, sortedRecords.length)} dari {sortedRecords.length} data
              </span>
              <div className="pagination-buttons">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  className="btn-pagination"
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <div className="page-numbers">
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
                        className={`page-num ${pageNum === currentPage ? 'active' : ''}`}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  className="btn-pagination"
                  disabled={currentPage === totalPages}
                >
                  Selanjutnya <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
