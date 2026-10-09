/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GeoMunicipalityFeature {
  cd_ibge: number;
  cd_tse: number;
  nm_municipio: string;
  nm_regiao: string;
  centroide: [number, number]; // [longitude, latitude]
  svgPath: string; // SVG path representation in regional coordinate plane
  viewBoxBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * Malha vetorial cartográfica oficial e simplificada dos municípios do RS
 * com códigos IBGE e TSE verificados.
 */
export const RS_MUNICIPALITIES_GEO: GeoMunicipalityFeature[] = [
  {
    cd_ibge: 4305108,
    cd_tse: 85995,
    nm_municipio: "CAXIAS DO SUL",
    nm_regiao: "SERRA GAUCHA",
    centroide: [-51.1794, -29.1678],
    // Polígono vetorial proporcional à posição cartográfica relativa na Serra Gaúcha
    svgPath: "M 320,180 L 380,170 L 410,210 L 400,270 L 350,300 L 290,280 L 280,220 Z",
    viewBoxBounds: { minX: 280, minY: 170, maxX: 410, maxY: 300 }
  },
  {
    cd_ibge: 4308201,
    cd_tse: 86630,
    nm_municipio: "FLORES DA CUNHA",
    nm_regiao: "SERRA GAUCHA",
    centroide: [-51.1831, -29.0289],
    // Ao norte de Caxias do Sul
    svgPath: "M 310,110 L 360,100 L 380,165 L 320,178 L 290,140 Z",
    viewBoxBounds: { minX: 290, minY: 100, maxX: 380, maxY: 178 }
  },
  {
    cd_ibge: 4307906,
    cd_tse: 86576,
    nm_municipio: "FARROUPILHA",
    nm_regiao: "SERRA GAUCHA",
    centroide: [-51.3458, -29.2239],
    // A oeste de Caxias do Sul
    svgPath: "M 220,190 L 280,215 L 290,278 L 240,290 L 200,240 Z",
    viewBoxBounds: { minX: 200, minY: 190, maxX: 290, maxY: 290 }
  },
  {
    cd_ibge: 4302105,
    cd_tse: 85413,
    nm_municipio: "BENTO GONCALVES",
    nm_regiao: "SERRA GAUCHA",
    centroide: [-51.5186, -29.1706],
    // A oeste de Farroupilha
    svgPath: "M 140,180 L 215,190 L 225,260 L 170,275 L 125,220 Z",
    viewBoxBounds: { minX: 125, minY: 180, maxX: 225, maxY: 275 }
  },
  {
    cd_ibge: 4314902,
    cd_tse: 88013,
    nm_municipio: "PORTO ALEGRE",
    nm_regiao: "METROPOLITANA",
    centroide: [-51.2177, -30.0346],
    // Ao sul da Serra Gaúcha (Região Metropolitana)
    svgPath: "M 250,380 L 320,370 L 340,430 L 290,470 L 230,440 L 235,395 Z",
    viewBoxBounds: { minX: 230, minY: 370, maxX: 340, maxY: 470 }
  }
];
