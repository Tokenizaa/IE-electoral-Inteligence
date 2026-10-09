/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GeoMunicipalityFeature {
  cd_ibge: number;
  cd_tse: number;
  nm_municipio: string;
  nm_regiao: string;
  centroide: [number, number];
  svgPath: string;
  viewBoxBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * A malha cartográfica municipal oficial ainda não foi incorporada e validada.
 * A ausência de geometria deve ser tratada como indisponibilidade, nunca como mapa real.
 */
export const RS_MUNICIPALITIES_GEO: GeoMunicipalityFeature[] = [];
