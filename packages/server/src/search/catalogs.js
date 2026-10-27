/**
 * The two curated contact-map catalogs: the ENCODE and 4DN TSVs on
 * igvteam/igv-data, and the columns read from each (design §6, §11 Q2).
 * Server-only fields live in dataSourceConfigs.js.
 */

const encodeContactMapDatasourceConfiguration =
    {
        url: 'https://raw.githubusercontent.com/igvteam/igv-data/main/data/encode/hic.txt',
        columns:
            [
                // 'HREF',
                'Assembly',
                'Biosample',
                'Description',
                'BioRep',
                'TechRep',
                'Lab',
                'Accession',
                'Experiment',
                // 'nvi'
            ],
    }

const fourdnContactMapDatasourceConfiguration =
    {
            url: 'https://raw.githubusercontent.com/igvteam/igv-data/main/data/4dn/4dn_hic.txt',
            columns:
                [
                        // 'url',
                        'Project',
                        'Assembly',
                        'Biosource',
                        'Assay',
                        'Dataset',
                        // 'Description',
                        'Publications',
                        'Lab',
                        'Replicate',
                        'Accession',
                        'Experiment'
                ],
    }

export { encodeContactMapDatasourceConfiguration, fourdnContactMapDatasourceConfiguration }
