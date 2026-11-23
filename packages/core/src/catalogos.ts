import { finDeMes, mesesEntre } from './fechas.ts';
import type { Categoria, Dataset, ElementoPlano, ISODate, MetaDataset, Planta, Zona } from './types.ts';

export interface Catalogos {
  meta: MetaDataset;
  plantas: Planta[];
  zonas: Zona[];
  categorias: Categoria[];
  elementos: ElementoPlano[];
  /** Fechas de corte seleccionables: cierres de mes y la fecha de corte actual. */
  cortes: ISODate[];
}

export function catalogos(ds: Dataset): Catalogos {
  const meses = mesesEntre(ds.meta.fechaApertura, ds.meta.fechaCorte);
  const cortes = meses.map(finDeMes).filter((d) => d < ds.meta.fechaCorte);
  cortes.push(ds.meta.fechaCorte);
  return {
    meta: ds.meta,
    plantas: ds.plantas,
    zonas: ds.zonas,
    categorias: ds.categorias,
    elementos: ds.elementos,
    cortes,
  };
}
