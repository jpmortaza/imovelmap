"use client";

import { MapContainer, TileLayer, Marker, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa pequeno da ficha do imóvel: só mostra ONDE ele está.
 *
 * Sem filtros, sem outros pinos, sem interação de prospecção — quem quer isso
 * vai para /mapa. Aqui o corretor só precisa se situar antes de ligar ou de
 * bater na porta.
 *
 * O círculo de 80 m existe para lembrar que a coordenada do portal é
 * aproximada quando o número da porta foi deduzido: fingir precisão de metro
 * levaria o corretor ao prédio errado com cara de certeza.
 */
export default function MiniMapa({
  lat,
  lng,
  cor = "#dc2626",
  incerto = false,
  altura = 260
}: {
  lat: number;
  lng: number;
  cor?: string;
  incerto?: boolean;
  altura?: number;
}) {
  const icone = L.divIcon({
    className: "",
    html:
      `<div style="width:18px;height:18px;border-radius:50%;background:${cor};` +
      `border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={incerto ? 15 : 17}
      scrollWheelZoom={false}
      style={{ height: altura, width: "100%", borderRadius: 10 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {incerto && (
        <Circle
          center={[lat, lng]}
          radius={80}
          pathOptions={{ color: "#eab308", fillColor: "#eab308", fillOpacity: 0.12 }}
        />
      )}
      <Marker position={[lat, lng]} icon={icone} />
    </MapContainer>
  );
}
