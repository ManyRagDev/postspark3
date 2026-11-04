/** Offline editorial annotations of the r9 catalogue. These are advisory use
 * cases, not thematic restrictions, verified fit limits, or human approval.
 * Runtime matching is by the immutable source AND offered component hashes. */
export const EDITORIAL_CATALOG_PROFILES_VERSION = 1 as const;
export type EditorialDimension =
  | "objective"
  | "structure"
  | "tone"
  | "emphasis";

export interface EditorialReference {
  id: string;
  text: string;
  dimension: EditorialDimension;
  /** Each listed composition independently supports this use case. */
  evidenceComponentIds: readonly string[];
}
export interface EditorialCatalogProfile {
  /** A family name is not unique: r9 has 29 sources and 25 family names. */
  id: string;
  familyId: string;
  evidence: {
    sourceId: string;
    sourceHash: string;
    sourcePath: string;
    components: readonly { id: string; hash: string }[];
    composition: string;
  };
  references: readonly EditorialReference[];
}

export interface EditorialCatalogIdentity {
  family: string;
  sourceId: string;
  sourceHash: string;
  /** Supply the actual offered variants. Omitting them means source-only. */
  components?: readonly { id: string; hash: string }[];
}

export const editorialCatalogProfiles: readonly EditorialCatalogProfile[] = [
  {
    id: "6dc5d744-8940-4eac-8016-1517c7c556c0",
    familyId: "f65e1862777e3c9e201442396155f3fa",
    evidence: {
      sourceId: "6dc5d744-8940-4eac-8016-1517c7c556c0",
      sourceHash:
        "a6e9caa71dd767f4773c1efc923497dc2a6d265c8f1861b02ab1157380215be2",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/6dc5d744-8940-4eac-8016-1517c7c556c0.json",
      components: [
        {
          id: "6dc5d744-8940-4eac-8016-1517c7c556c0",
          hash: "a6e9caa71dd767f4773c1efc923497dc2a6d265c8f1861b02ab1157380215be2",
        },
        {
          id: "bddc7412-072f-4ee9-848c-827b2da518c2",
          hash: "378a8ab8e6b4293b34c665d81d212af541cb2ee8aa0be9f9b84981e948080023",
        },
        {
          id: "56deb11e-9f26-45b0-8283-ed949569c5b2",
          hash: "a89aa62ecc46a20d1530f5d157ce3df8a25f5be7fd677755137dc5c81e572b3d",
        },
        {
          id: "8e7af1fb-8bd0-4cf7-8b9a-166d2de8586d",
          hash: "225f6e2e3db34aadcd479ae8ad0bb30151b4b29217443ec587cf485243e4c6e3",
        },
        {
          id: "9c08503e-2d61-400f-80a8-49fde6350c40",
          hash: "3900e355b54967bc238ee3c6d491465fc97c8ee83fb3c1b91a0d2c75fb4152da",
        },
      ],
      composition:
        "Fundo creme, frase preta compacta acima e grande fotografia de pessoa/produto com mãos e objetos na base. Quadro amarelo marca um produto; mídia substituta deve alinhar esse ponto focal ao quadro, que não acompanha objetos automaticamente. 3 regiões de título, 0 apoios textuais, 0 listas semânticas e 1 slots de mídia. 9 camadas em 1080×1350; fontes Inter.",
    },
    references: [
      {
        id: "6dc5d744-8940-4eac-8016-1517c7c556c0:1",
        text: "Apresentar uma pessoa, objeto ou produto pela fotografia, acompanhada de uma frase curta.",
        dimension: "objective",
        evidenceComponentIds: [
          "6dc5d744-8940-4eac-8016-1517c7c556c0",
          "bddc7412-072f-4ee9-848c-827b2da518c2",
          "8e7af1fb-8bd0-4cf7-8b9a-166d2de8586d",
        ],
      },
      {
        id: "6dc5d744-8940-4eac-8016-1517c7c556c0:2",
        text: "Comentar uma imagem com uma única mensagem breve, deixando a cena comunicar o contexto.",
        dimension: "structure",
        evidenceComponentIds: [
          "6dc5d744-8940-4eac-8016-1517c7c556c0",
          "bddc7412-072f-4ee9-848c-827b2da518c2",
          "8e7af1fb-8bd0-4cf7-8b9a-166d2de8586d",
        ],
      },
      {
        id: "6dc5d744-8940-4eac-8016-1517c7c556c0:3",
        text: "Dar protagonismo à imagem e destacar apenas a ideia principal no título.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "6dc5d744-8940-4eac-8016-1517c7c556c0",
          "bddc7412-072f-4ee9-848c-827b2da518c2",
          "8e7af1fb-8bd0-4cf7-8b9a-166d2de8586d",
        ],
      },
      {
        id: "6dc5d744-8940-4eac-8016-1517c7c556c0:4",
        text: "Encerrar uma sequência com uma frase de síntese acompanhando a fotografia.",
        dimension: "objective",
        evidenceComponentIds: [
          "56deb11e-9f26-45b0-8283-ed949569c5b2",
          "9c08503e-2d61-400f-80a8-49fde6350c40",
        ],
      },
    ],
  },
  {
    id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
    familyId: "brutal-split",
    evidence: {
      sourceId: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
      sourceHash:
        "10961ad8e5d7ee6fc213f05e3c38b627e715b598e369d7f4dfb5e30a1fc6064a",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/a8562b71-e1e1-4bfa-8cdd-28194a40b6f1.json",
      components: [
        {
          id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
          hash: "10961ad8e5d7ee6fc213f05e3c38b627e715b598e369d7f4dfb5e30a1fc6064a",
        },
        {
          id: "c9c94083-4fa5-42cc-8e39-0f8d5431f4f0",
          hash: "f745048cb5d8b0c14947180263759902db37767cb46c970015c90807b5d4824a",
        },
        {
          id: "65fdcfca-b630-4840-8e93-c69cc36009b1",
          hash: "fb01495dfbd08e107e62295ddb3e19585420f47d2bc5f00f0dcc2920837c9a5c",
        },
        {
          id: "31411440-e5fe-42ac-8d86-0b5e215e223e",
          hash: "e524a098ffadeebbf7fee45524b332ececa300ac1229c820347cb536e49e1d93",
        },
        {
          id: "3dde29a1-d98c-4291-8ebf-723b9b7bea51",
          hash: "111a542a8e9f71bb5cc3b9fcc7227693755a8b1d43d37597090bc59bb1c08d4f",
        },
      ],
      composition:
        "Composição dividida, contraste forte entre áreas e título de impacto. Os blocos de texto mantêm funções distintas dentro da divisão nativa.",
    },
    references: [
      {
        id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1:1",
        text: "Anunciar uma novidade com frase de impacto e fotografia complementar.",
        dimension: "objective",
        evidenceComponentIds: [
          "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
          "c9c94083-4fa5-42cc-8e39-0f8d5431f4f0",
          "31411440-e5fe-42ac-8d86-0b5e215e223e",
        ],
      },
      {
        id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1:2",
        text: "Apresentar uma única afirmação curta ao lado de uma imagem, em áreas visualmente separadas.",
        dimension: "structure",
        evidenceComponentIds: [
          "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
          "c9c94083-4fa5-42cc-8e39-0f8d5431f4f0",
          "31411440-e5fe-42ac-8d86-0b5e215e223e",
        ],
      },
      {
        id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1:3",
        text: "Destacar uma mensagem direta em letras grandes e forte contraste com a fotografia.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1",
          "c9c94083-4fa5-42cc-8e39-0f8d5431f4f0",
          "31411440-e5fe-42ac-8d86-0b5e215e223e",
        ],
      },
      {
        id: "a8562b71-e1e1-4bfa-8cdd-28194a40b6f1:4",
        text: "Concluir com uma mensagem breve de destaque e uma imagem que a acompanha.",
        dimension: "objective",
        evidenceComponentIds: [
          "65fdcfca-b630-4840-8e93-c69cc36009b1",
          "3dde29a1-d98c-4291-8ebf-723b9b7bea51",
        ],
      },
    ],
  },
  {
    id: "f49daa11-9ba1-4313-8e14-6097bb187757",
    familyId: "versus",
    evidence: {
      sourceId: "f49daa11-9ba1-4313-8e14-6097bb187757",
      sourceHash:
        "ca9bcb5c2fe0178cea47437d8c97a53b19c65db4217b4c9c17dbfb9429ba3f1d",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/f49daa11-9ba1-4313-8e14-6097bb187757.json",
      components: [
        {
          id: "f49daa11-9ba1-4313-8e14-6097bb187757",
          hash: "ca9bcb5c2fe0178cea47437d8c97a53b19c65db4217b4c9c17dbfb9429ba3f1d",
        },
        {
          id: "02430ac2-c2dc-4459-8695-410ebb500d58",
          hash: "0f1f06286c38a454fa9c986234e0e98517ef52202fc6c95502972aaac106a05c",
        },
        {
          id: "7317d7b9-3a79-430b-8e85-88acaf0dab73",
          hash: "09148c32f5e009fc56c38e90dc48cad3917d0f2c1d7280cfc494203232998c4f",
        },
        {
          id: "32d67f78-45da-4db8-8304-4e3ba3277d4a",
          hash: "fe815c3d7c62f8b5185196f1c918517895e33d851296aaf22dcd3281405583ad",
        },
        {
          id: "f9b74dd3-146b-4bbb-874e-2c883391ce7e",
          hash: "84bb72fd65ebb4218ba90dbd3cc5f5017264f3e0a20666ca2619aaedb228e7cd",
        },
        {
          id: "e38e35c5-3cfd-4187-857f-7cc695fb9069",
          hash: "d69818f745652d991040b633d193360e4f7a20c05dccd5f8947ff22f7c39f71d",
        },
        {
          id: "fa11cb00-b2c4-48cb-878c-279032716aec",
          hash: "b8a7108b84b65491c7e119e4e52cc52572e39bb65c4f64861e026eead0b9b78c",
        },
      ],
      composition:
        "Duas áreas contrapostas para lados de uma comparação, com título compartilhado. O contraste entre os lados é parte da composição, sem impor tema ou tom.",
    },
    references: [
      {
        id: "f49daa11-9ba1-4313-8e14-6097bb187757:1",
        text: "Comparar duas alternativas lado a lado, com uma explicação curta para cada uma.",
        dimension: "structure",
        evidenceComponentIds: [
          "f49daa11-9ba1-4313-8e14-6097bb187757",
          "02430ac2-c2dc-4459-8695-410ebb500d58",
          "7317d7b9-3a79-430b-8e85-88acaf0dab73",
          "f9b74dd3-146b-4bbb-874e-2c883391ce7e",
          "e38e35c5-3cfd-4187-857f-7cc695fb9069",
        ],
      },
      {
        id: "f49daa11-9ba1-4313-8e14-6097bb187757:2",
        text: "Esclarecer diferenças entre duas opções para ajudar o leitor a escolher.",
        dimension: "objective",
        evidenceComponentIds: [
          "f49daa11-9ba1-4313-8e14-6097bb187757",
          "02430ac2-c2dc-4459-8695-410ebb500d58",
          "7317d7b9-3a79-430b-8e85-88acaf0dab73",
          "f9b74dd3-146b-4bbb-874e-2c883391ce7e",
          "e38e35c5-3cfd-4187-857f-7cc695fb9069",
        ],
      },
      {
        id: "f49daa11-9ba1-4313-8e14-6097bb187757:3",
        text: "Contrapor uma afirmação e sua correção, separando os dois lados da comparação.",
        dimension: "structure",
        evidenceComponentIds: [
          "f49daa11-9ba1-4313-8e14-6097bb187757",
          "02430ac2-c2dc-4459-8695-410ebb500d58",
          "7317d7b9-3a79-430b-8e85-88acaf0dab73",
          "f9b74dd3-146b-4bbb-874e-2c883391ce7e",
          "e38e35c5-3cfd-4187-857f-7cc695fb9069",
        ],
      },
      {
        id: "f49daa11-9ba1-4313-8e14-6097bb187757:4",
        text: "Evidenciar o contraste entre dois argumentos sob um título compartilhado.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "f49daa11-9ba1-4313-8e14-6097bb187757",
          "02430ac2-c2dc-4459-8695-410ebb500d58",
          "7317d7b9-3a79-430b-8e85-88acaf0dab73",
          "32d67f78-45da-4db8-8304-4e3ba3277d4a",
          "f9b74dd3-146b-4bbb-874e-2c883391ce7e",
          "e38e35c5-3cfd-4187-857f-7cc695fb9069",
          "fa11cb00-b2c4-48cb-878c-279032716aec",
        ],
      },
    ],
  },
  {
    id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
    familyId: "gifts-paper",
    evidence: {
      sourceId: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
      sourceHash:
        "71bb676ec3cedee1939278ff0d8da42107d01cd2ebe9415ca876f6915f1eda24",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b.json",
      components: [
        {
          id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
          hash: "71bb676ec3cedee1939278ff0d8da42107d01cd2ebe9415ca876f6915f1eda24",
        },
        {
          id: "af1ef921-33c8-4a0d-862c-6ad476cce751",
          hash: "2963fa898254b267dd5dde51b9c6182327c5657aed0eaad7723ae57d5f1273a1",
        },
        {
          id: "f2eb9d20-d9c5-46ab-8967-faca6298001b",
          hash: "1cb3cd41c6f3b9f332776e12ae1f7b110d347848d5d8cbe42c0021b3b0145177",
        },
        {
          id: "c00f4d7e-34d5-439f-89cc-8cea7b89b42e",
          hash: "ae9a9cff089bc4137b246ba7f11be21f0718274efd3a99121b64ab73d4cb7c04",
        },
        {
          id: "0fb73817-333d-439e-885b-0d95b0112066",
          hash: "1694b6a65576e00be2d5c274e8d55d0fad807b44579883e447ea5e4ba7d7cc30",
        },
        {
          id: "36462fc9-6440-4652-8036-94e14ce7ed24",
          hash: "19069b66f6de73d4b3fd570b8a5d90135a013e0972245f326458188bbc1e32d2",
        },
        {
          id: "d4cdf877-b48f-4a07-8348-de23c3206d52",
          hash: "7ff1d544ffba14c84bb446a81ed6be29b1f38f544ed01a9c11ee353ae723f926",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 1 slots de mídia. 13 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b:1",
        text: "Apresentar uma oferta ou convite com fotografia, uma explicação curta e próximo passo.",
        dimension: "objective",
        evidenceComponentIds: [
          "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
          "af1ef921-33c8-4a0d-862c-6ad476cce751",
          "f2eb9d20-d9c5-46ab-8967-faca6298001b",
          "c00f4d7e-34d5-439f-89cc-8cea7b89b42e",
          "0fb73817-333d-439e-885b-0d95b0112066",
          "36462fc9-6440-4652-8036-94e14ce7ed24",
          "d4cdf877-b48f-4a07-8348-de23c3206d52",
        ],
      },
      {
        id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b:2",
        text: "Comentar uma imagem usando título, pequeno parágrafo de apoio e chamada à ação.",
        dimension: "structure",
        evidenceComponentIds: [
          "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
          "af1ef921-33c8-4a0d-862c-6ad476cce751",
          "f2eb9d20-d9c5-46ab-8967-faca6298001b",
          "0fb73817-333d-439e-885b-0d95b0112066",
          "36462fc9-6440-4652-8036-94e14ce7ed24",
        ],
      },
      {
        id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b:3",
        text: "Explicar uma ideia por página, mantendo a fotografia e desenvolvendo o apoio textual.",
        dimension: "structure",
        evidenceComponentIds: [
          "f2eb9d20-d9c5-46ab-8967-faca6298001b",
          "36462fc9-6440-4652-8036-94e14ce7ed24",
        ],
      },
      {
        id: "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b:4",
        text: "Destacar uma mensagem com imagem e concluir com um convite claro.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "f0b1f9f1-d0bc-41a4-8878-f57f0f4f9b6b",
          "c00f4d7e-34d5-439f-89cc-8cea7b89b42e",
          "d4cdf877-b48f-4a07-8348-de23c3206d52",
        ],
      },
    ],
  },
  {
    id: "408db15a-9f12-449c-803a-976391883758",
    familyId: "daily-paper",
    evidence: {
      sourceId: "408db15a-9f12-449c-803a-976391883758",
      sourceHash:
        "92e9e0c6b15e79c8e2824422e3c85daa956371d58e699b2ec9e17f96b8c577a1",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/408db15a-9f12-449c-803a-976391883758.json",
      components: [
        {
          id: "408db15a-9f12-449c-803a-976391883758",
          hash: "92e9e0c6b15e79c8e2824422e3c85daa956371d58e699b2ec9e17f96b8c577a1",
        },
        {
          id: "cd531c3e-f868-4ab5-86ed-19a7fdf7cd3d",
          hash: "5e3e7a5d839f28d242dd0dbc77e5f59f04406f91b39fd241b849e83ed8e354ac",
        },
        {
          id: "b7e2bd7d-351e-4d81-80e2-a91055c5dda3",
          hash: "89a31150aa6e245eb634888859ceedb37e01c6dce0d4e4356e09230853c97dff",
        },
        {
          id: "ec947f61-6552-45ca-8101-c8f28d5fcc99",
          hash: "63932908f2352a8d171a6f716605689bc4f2eb80e50644930e99814d2c1347ae",
        },
        {
          id: "c2bb0982-d6ce-44a3-8c45-8597f80737cb",
          hash: "c97788931d5fe9e1afd8cdf6d93b41572685cff1c40c856ce0c83b833a61d5d6",
        },
        {
          id: "13d86625-3f5e-4044-8038-a1873357085d",
          hash: "60dd1a4b63db7f6a1d51bb00075a83bcb6a630344102661b7663d6f868f4abcc",
        },
        {
          id: "ebf6870a-8c65-4a0a-8ff5-1f754b44a514",
          hash: "cb6cdbb6e10b79eb74c0ec5cf9e709dd11964350a740053088345caf91d193fc",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 3 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 47 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "408db15a-9f12-449c-803a-976391883758:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "b7e2bd7d-351e-4d81-80e2-a91055c5dda3",
          "13d86625-3f5e-4044-8038-a1873357085d",
        ],
      },
      {
        id: "408db15a-9f12-449c-803a-976391883758:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "b7e2bd7d-351e-4d81-80e2-a91055c5dda3",
          "13d86625-3f5e-4044-8038-a1873357085d",
        ],
      },
      {
        id: "408db15a-9f12-449c-803a-976391883758:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "408db15a-9f12-449c-803a-976391883758",
          "cd531c3e-f868-4ab5-86ed-19a7fdf7cd3d",
          "b7e2bd7d-351e-4d81-80e2-a91055c5dda3",
          "c2bb0982-d6ce-44a3-8c45-8597f80737cb",
          "13d86625-3f5e-4044-8038-a1873357085d",
        ],
      },
      {
        id: "408db15a-9f12-449c-803a-976391883758:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "ec947f61-6552-45ca-8101-c8f28d5fcc99",
          "ebf6870a-8c65-4a0a-8ff5-1f754b44a514",
        ],
      },
    ],
  },
  {
    id: "8c32f6a2-9e62-46ac-8220-8b64856f019e",
    familyId: "daily-window",
    evidence: {
      sourceId: "8c32f6a2-9e62-46ac-8220-8b64856f019e",
      sourceHash:
        "a8b1adbb99234d15e55e21f6b7bddc0ed42ecb87cf726da9bfa8c6d863e4874d",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/8c32f6a2-9e62-46ac-8220-8b64856f019e.json",
      components: [
        {
          id: "8c32f6a2-9e62-46ac-8220-8b64856f019e",
          hash: "a8b1adbb99234d15e55e21f6b7bddc0ed42ecb87cf726da9bfa8c6d863e4874d",
        },
        {
          id: "b0f4b8d8-a0e7-48a1-8ca6-57631aa2c03f",
          hash: "c8dc3fb1172ff86f86e2dde55dcf189a3ab96206a80f436c848b8e2614b5070e",
        },
        {
          id: "bd24c73e-7f62-408d-863f-bb896fdc8c9c",
          hash: "e4b75a8ea3e18e97efcd80995aa22309ebb4c7fe50db730d17be5db9dcb14f41",
        },
        {
          id: "58b967b1-ea4f-466f-86ab-9b56275bcdb2",
          hash: "b99ee0559bd564175cddba272c5f95b11a40bcc47bb69e29ea25edf0bb15de2d",
        },
        {
          id: "71268b22-4630-4b72-887e-1c8e1b56d00e",
          hash: "d1866d825c45ae9a2a6b633ae8e6029621e87086c236b9b60576458318e6b71c",
        },
        {
          id: "23ed569d-0590-46f0-8e4a-29652f3e58b6",
          hash: "68309c54a2e222280e6ef0af2f6bd26780a3e85d974a11a2861211310501ee2e",
        },
        {
          id: "4bdda60a-ccb7-4ebb-8b44-18529227fdcb",
          hash: "212b2bf60b0da43cff1d427f07eb43b6f541b6676c653b5cb0d50724514182a7",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 45 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "8c32f6a2-9e62-46ac-8220-8b64856f019e:1",
        text: "Apresentar uma explicação curta em um painel com título, apoio e próximo passo.",
        dimension: "structure",
        evidenceComponentIds: [
          "8c32f6a2-9e62-46ac-8220-8b64856f019e",
          "bd24c73e-7f62-408d-863f-bb896fdc8c9c",
          "23ed569d-0590-46f0-8e4a-29652f3e58b6",
        ],
      },
      {
        id: "8c32f6a2-9e62-46ac-8220-8b64856f019e:2",
        text: "Orientar o leitor com uma ideia de cada vez e instruções concisas.",
        dimension: "objective",
        evidenceComponentIds: [
          "bd24c73e-7f62-408d-863f-bb896fdc8c9c",
          "23ed569d-0590-46f0-8e4a-29652f3e58b6",
        ],
      },
      {
        id: "8c32f6a2-9e62-46ac-8220-8b64856f019e:3",
        text: "Organizar a mensagem em blocos claros, destacando o título sobre o apoio textual.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "8c32f6a2-9e62-46ac-8220-8b64856f019e",
          "b0f4b8d8-a0e7-48a1-8ca6-57631aa2c03f",
          "bd24c73e-7f62-408d-863f-bb896fdc8c9c",
          "71268b22-4630-4b72-887e-1c8e1b56d00e",
          "23ed569d-0590-46f0-8e4a-29652f3e58b6",
        ],
      },
      {
        id: "8c32f6a2-9e62-46ac-8220-8b64856f019e:4",
        text: "Fechar com uma síntese curta e convite para a próxima ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "58b967b1-ea4f-466f-86ab-9b56275bcdb2",
          "4bdda60a-ccb7-4ebb-8b44-18529227fdcb",
        ],
      },
    ],
  },
  {
    id: "29b34537-dadd-4db7-8b83-d7373ea792c2",
    familyId: "ideas-window",
    evidence: {
      sourceId: "29b34537-dadd-4db7-8b83-d7373ea792c2",
      sourceHash:
        "1caa5203b6b1cf02c6dc2aeacd72524e945dcf2e4e19c7cb6eaf9dd797a4ef03",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/29b34537-dadd-4db7-8b83-d7373ea792c2.json",
      components: [
        {
          id: "29b34537-dadd-4db7-8b83-d7373ea792c2",
          hash: "1caa5203b6b1cf02c6dc2aeacd72524e945dcf2e4e19c7cb6eaf9dd797a4ef03",
        },
        {
          id: "a3930fce-02ea-4869-8485-eec1003a9d00",
          hash: "49151200cf58e4ff73846620b871ec602fafb4e7697269cf954c8347b1a79407",
        },
        {
          id: "098852c4-ad2b-43cb-8a36-f72a59c34b43",
          hash: "ddb71ebac0915408ce6dd1441fb1942e241986083bef130cdb292eb33a489662",
        },
        {
          id: "e793a9c1-2dfb-407a-8464-fdcfd5db8d5a",
          hash: "26f6db91317bf688345f5e773f92a1b56fa8929003269a52dd86b05a90550205",
        },
        {
          id: "f280b52a-98d7-4128-8d02-6769ffef6784",
          hash: "b81cff4bd37790a544bd409eda1a099307790d2025223fd60dbf7d249cac2e77",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 1 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 65 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "29b34537-dadd-4db7-8b83-d7373ea792c2:1",
        text: "Anunciar uma novidade com título breve, uma linha de apoio e convite.",
        dimension: "objective",
        evidenceComponentIds: [
          "29b34537-dadd-4db7-8b83-d7373ea792c2",
          "a3930fce-02ea-4869-8485-eec1003a9d00",
          "e793a9c1-2dfb-407a-8464-fdcfd5db8d5a",
        ],
      },
      {
        id: "29b34537-dadd-4db7-8b83-d7373ea792c2:2",
        text: "Apresentar uma única ideia em destaque, seguida de uma explicação muito curta.",
        dimension: "structure",
        evidenceComponentIds: [
          "29b34537-dadd-4db7-8b83-d7373ea792c2",
          "a3930fce-02ea-4869-8485-eec1003a9d00",
          "e793a9c1-2dfb-407a-8464-fdcfd5db8d5a",
        ],
      },
      {
        id: "29b34537-dadd-4db7-8b83-d7373ea792c2:3",
        text: "Chamar atenção para a mensagem principal e deixar o próximo passo visível.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "29b34537-dadd-4db7-8b83-d7373ea792c2",
          "a3930fce-02ea-4869-8485-eec1003a9d00",
          "098852c4-ad2b-43cb-8a36-f72a59c34b43",
          "e793a9c1-2dfb-407a-8464-fdcfd5db8d5a",
          "f280b52a-98d7-4128-8d02-6769ffef6784",
        ],
      },
      {
        id: "29b34537-dadd-4db7-8b83-d7373ea792c2:4",
        text: "Concluir com uma síntese concisa e chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "098852c4-ad2b-43cb-8a36-f72a59c34b43",
          "f280b52a-98d7-4128-8d02-6769ffef6784",
        ],
      },
    ],
  },
  {
    id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
    familyId: "window-ribbons-requested",
    evidence: {
      sourceId: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
      sourceHash:
        "afb2ac9ad1fe5f4262b2e1638a679daa7d87060a29a91f86c62a11d294ab6428",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/8ef8835c-108f-43e7-8a5e-c20fc69b0bf7.json",
      components: [
        {
          id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
          hash: "afb2ac9ad1fe5f4262b2e1638a679daa7d87060a29a91f86c62a11d294ab6428",
        },
        {
          id: "173dc86c-c12d-48df-8435-ffa06f01b9a1",
          hash: "3b985bcff96baed8bee3b29518b2cc2b5c4d4319b144d3c743b508a0b8650d6b",
        },
        {
          id: "bc7506fb-060f-4504-8d92-b5e58081f59a",
          hash: "3ee09ebbac7b80e6a60a6b4eac313f7ca2e6a1341cee5827c8ecc5cf45ac148a",
        },
        {
          id: "8f7bd056-fda4-4fbb-8c69-3932f69e6b9b",
          hash: "129dbe4874e880c2e50208ee54b16c2ce163248889516f2e04c36b97ba47ca17",
        },
        {
          id: "53cf3f65-3b18-4fb5-834f-556a0805372e",
          hash: "efed503bef99ce31a42c2c3c91cc17a9f3e0287df93ca4a0719d71ff3e920192",
        },
      ],
      composition:
        "2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 43 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7:1",
        text: "Anunciar uma novidade com título breve, uma linha de apoio e convite.",
        dimension: "objective",
        evidenceComponentIds: [
          "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
          "173dc86c-c12d-48df-8435-ffa06f01b9a1",
          "8f7bd056-fda4-4fbb-8c69-3932f69e6b9b",
        ],
      },
      {
        id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7:2",
        text: "Apresentar uma única ideia em destaque, seguida de uma explicação muito curta.",
        dimension: "structure",
        evidenceComponentIds: [
          "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
          "173dc86c-c12d-48df-8435-ffa06f01b9a1",
          "8f7bd056-fda4-4fbb-8c69-3932f69e6b9b",
        ],
      },
      {
        id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7:3",
        text: "Chamar atenção para a mensagem principal e deixar o próximo passo visível.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7",
          "173dc86c-c12d-48df-8435-ffa06f01b9a1",
          "bc7506fb-060f-4504-8d92-b5e58081f59a",
          "8f7bd056-fda4-4fbb-8c69-3932f69e6b9b",
          "53cf3f65-3b18-4fb5-834f-556a0805372e",
        ],
      },
      {
        id: "8ef8835c-108f-43e7-8a5e-c20fc69b0bf7:4",
        text: "Concluir com uma síntese concisa e chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "bc7506fb-060f-4504-8d92-b5e58081f59a",
          "53cf3f65-3b18-4fb5-834f-556a0805372e",
        ],
      },
    ],
  },
  {
    id: "a3f983f9-cab6-42af-8bfa-03d4e790354b",
    familyId: "6da56cf3eb349b1ef42ab98eaf610f05",
    evidence: {
      sourceId: "a3f983f9-cab6-42af-8bfa-03d4e790354b",
      sourceHash:
        "de67db8e60d902f34cde8e8977ef9b85be27d7d452110c75109b03697df82d03",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/a3f983f9-cab6-42af-8bfa-03d4e790354b.json",
      components: [
        {
          id: "a3f983f9-cab6-42af-8bfa-03d4e790354b",
          hash: "de67db8e60d902f34cde8e8977ef9b85be27d7d452110c75109b03697df82d03",
        },
        {
          id: "0e16efa6-f075-47a7-8a5a-4cfae8fc13b6",
          hash: "2b324a94b77cc47f90757bdb90f66ed8cfcd5746d7db62c63a5c8f8052c461df",
        },
        {
          id: "ea67c787-997e-4a34-8a0a-983666de8f45",
          hash: "6daa754aedd3045cc093abe7a2336004d98cf874812cbab456b05842cf07730a",
        },
        {
          id: "cc7cd2db-2c25-4ac9-8b5d-a0d1e405158c",
          hash: "ba320fe3c8eb2d157f9da12940b8c7cd3db008e7d9cbc5f158ea4535b3cae455",
        },
        {
          id: "4d80bfc6-d659-40e7-882e-582c5258dbed",
          hash: "9c2eb9680f6cc34d139bbf555cea549fde9bcfcee409bd84ab83cb86eea16629",
        },
        {
          id: "22b2d7fb-4ca5-4ff8-856d-123f40421d8e",
          hash: "02695161bd6cbb1eeedccd044c813e5d9110302d0bdd23a67c8043072f7d3f27",
        },
        {
          id: "813ab54e-b94d-48be-80a6-3ffac939648f",
          hash: "498be226c06d9932e1c9bffb6109db1f84609e168fe5f5ef7b3fae645aa1c554",
        },
      ],
      composition:
        "Página editorial clara com índice circular, título preto condensado, uma palavra sobre tarja coral, parágrafos curtos, lista de até três itens e citação laranja. A grade pontilhada fina do papel original ainda não está reproduzida. 3 regiões de título, 2 apoios textuais, 1 listas semânticas e 0 slots de mídia. 18 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "a3f983f9-cab6-42af-8bfa-03d4e790354b:1",
        text: "Explicar por que uma ideia importa, articulando argumento, exemplos e conclusão.",
        dimension: "objective",
        evidenceComponentIds: [
          "ea67c787-997e-4a34-8a0a-983666de8f45",
          "22b2d7fb-4ca5-4ff8-856d-123f40421d8e",
        ],
      },
      {
        id: "a3f983f9-cab6-42af-8bfa-03d4e790354b:2",
        text: "Desenvolver uma explicação com parágrafos curtos e até três itens de apoio independentes.",
        dimension: "structure",
        evidenceComponentIds: [
          "a3f983f9-cab6-42af-8bfa-03d4e790354b",
          "0e16efa6-f075-47a7-8a5a-4cfae8fc13b6",
          "ea67c787-997e-4a34-8a0a-983666de8f45",
          "4d80bfc6-d659-40e7-882e-582c5258dbed",
          "22b2d7fb-4ca5-4ff8-856d-123f40421d8e",
        ],
      },
      {
        id: "a3f983f9-cab6-42af-8bfa-03d4e790354b:3",
        text: "Apresentar razões ou recomendações em uma pequena lista, com espaço para contextualização.",
        dimension: "structure",
        evidenceComponentIds: [
          "a3f983f9-cab6-42af-8bfa-03d4e790354b",
          "0e16efa6-f075-47a7-8a5a-4cfae8fc13b6",
          "ea67c787-997e-4a34-8a0a-983666de8f45",
          "4d80bfc6-d659-40e7-882e-582c5258dbed",
          "22b2d7fb-4ca5-4ff8-856d-123f40421d8e",
        ],
      },
      {
        id: "a3f983f9-cab6-42af-8bfa-03d4e790354b:4",
        text: "Destacar uma conclusão ou citação depois de desenvolver o raciocínio.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "a3f983f9-cab6-42af-8bfa-03d4e790354b",
          "ea67c787-997e-4a34-8a0a-983666de8f45",
          "cc7cd2db-2c25-4ac9-8b5d-a0d1e405158c",
          "22b2d7fb-4ca5-4ff8-856d-123f40421d8e",
          "813ab54e-b94d-48be-80a6-3ffac939648f",
        ],
      },
    ],
  },
  {
    id: "88fc88de-3f47-49f7-86a4-82e89c5a24db",
    familyId: "ideas-paper",
    evidence: {
      sourceId: "88fc88de-3f47-49f7-86a4-82e89c5a24db",
      sourceHash:
        "1064a152f436560d4572d7c35098efa917310e9ec3730469f3a88ea2ce2a68c8",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/88fc88de-3f47-49f7-86a4-82e89c5a24db.json",
      components: [
        {
          id: "88fc88de-3f47-49f7-86a4-82e89c5a24db",
          hash: "1064a152f436560d4572d7c35098efa917310e9ec3730469f3a88ea2ce2a68c8",
        },
        {
          id: "37cc1a64-c7a4-4a5c-8b7b-e58c618fccfd",
          hash: "e3366e37f93a56a493fc6d663a2cde1a4f144016b9b5e08119439e15153f3434",
        },
        {
          id: "d92dd54e-19b3-485c-82d1-9737cbe58c24",
          hash: "6098cd7e4367c49166d31c03f3c278701dd644c5c1d48b15cde80c6aa359b1ad",
        },
        {
          id: "ba49132b-24cd-443a-8258-9e6ca12b80b7",
          hash: "6d9a8c4d7939a66dba1658a4fbdc820b87123656a68f63e8037e29746b240772",
        },
        {
          id: "e4d31b23-5757-4bb6-824d-89501a19efd5",
          hash: "bae3d16fde66357c5e750fb2f2286349b9c7a60a974817da2fe0a4d5850ec658",
        },
        {
          id: "58ddf692-e9ae-4ebc-81df-f2a604ec69e9",
          hash: "a1718cd2f1ed2b2b1c9604a6bcee29aeff464019657b4190a7ccabbc5c61e54e",
        },
        {
          id: "61bbd953-e618-4de9-870a-fb03fead4838",
          hash: "a1708a16cedfcf86d6eb6a7a7465f42342df7531f15ecb8aa0555eed4f255ac0",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 66 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "88fc88de-3f47-49f7-86a4-82e89c5a24db:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "d92dd54e-19b3-485c-82d1-9737cbe58c24",
          "58ddf692-e9ae-4ebc-81df-f2a604ec69e9",
        ],
      },
      {
        id: "88fc88de-3f47-49f7-86a4-82e89c5a24db:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "d92dd54e-19b3-485c-82d1-9737cbe58c24",
          "58ddf692-e9ae-4ebc-81df-f2a604ec69e9",
        ],
      },
      {
        id: "88fc88de-3f47-49f7-86a4-82e89c5a24db:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "88fc88de-3f47-49f7-86a4-82e89c5a24db",
          "37cc1a64-c7a4-4a5c-8b7b-e58c618fccfd",
          "d92dd54e-19b3-485c-82d1-9737cbe58c24",
          "e4d31b23-5757-4bb6-824d-89501a19efd5",
          "58ddf692-e9ae-4ebc-81df-f2a604ec69e9",
        ],
      },
      {
        id: "88fc88de-3f47-49f7-86a4-82e89c5a24db:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "ba49132b-24cd-443a-8258-9e6ca12b80b7",
          "61bbd953-e618-4de9-870a-fb03fead4838",
        ],
      },
    ],
  },
  {
    id: "7556a437-6195-4940-8d60-c8dfa34e9ea7",
    familyId: "minimal-air",
    evidence: {
      sourceId: "7556a437-6195-4940-8d60-c8dfa34e9ea7",
      sourceHash:
        "d05168d2b79e341725628bbed1a5cdd24ff50f4511b0bf5105c339f7dd33e8b3",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/7556a437-6195-4940-8d60-c8dfa34e9ea7.json",
      components: [
        {
          id: "7556a437-6195-4940-8d60-c8dfa34e9ea7",
          hash: "d05168d2b79e341725628bbed1a5cdd24ff50f4511b0bf5105c339f7dd33e8b3",
        },
        {
          id: "f814a87b-01cc-4a22-8d9a-e058a2a492cc",
          hash: "76b31f356ec8f9d73a83977a2cdbd7bca9a2540c1d2c2fe9bea5e8f2ba3aa7a5",
        },
        {
          id: "c96847a1-9af8-4865-8513-256ecc30e651",
          hash: "606968bb0270d344889c4223d6bbe36a29585010c610833bfaf86ca268cdf4ca",
        },
        {
          id: "cd57a847-79f5-48b3-8e95-455fbc1ed18f",
          hash: "5b72268c820dc4561404ece2b3a251e11fcec08bb21dd6fe99dee9c5a6b5972e",
        },
        {
          id: "dcf71994-da3d-46dd-8538-6bd9455d4c99",
          hash: "1f0860760cc9e4ef600b59c55c7d1f0e52f52f0b1660475b4a65397256828949",
        },
        {
          id: "cd56ffab-4be6-409c-8402-e8d2630bb94f",
          hash: "e1b490c46999b2453e298d471e14bfbc38ae7a0f6c90ee647deb10704db7570a",
        },
        {
          id: "1785728c-fca5-4859-817d-1faf29189d90",
          hash: "38c70eadf73400ee1498b672b64f99734421bfa39690d832304b61d87278bd06",
        },
      ],
      composition:
        "Hierarquia tipográfica contida com poucas regiões e respiro; favorece uma mensagem curta e apoio conciso, conforme capacidade das caixas.",
    },
    references: [
      {
        id: "7556a437-6195-4940-8d60-c8dfa34e9ea7:1",
        text: "Comunicar uma única ideia com poucas palavras e hierarquia visual discreta.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "7556a437-6195-4940-8d60-c8dfa34e9ea7",
          "f814a87b-01cc-4a22-8d9a-e058a2a492cc",
          "dcf71994-da3d-46dd-8538-6bd9455d4c99",
        ],
      },
      {
        id: "7556a437-6195-4940-8d60-c8dfa34e9ea7:2",
        text: "Apresentar título e apoio conciso, preservando espaço ao redor da mensagem.",
        dimension: "structure",
        evidenceComponentIds: [
          "7556a437-6195-4940-8d60-c8dfa34e9ea7",
          "f814a87b-01cc-4a22-8d9a-e058a2a492cc",
          "c96847a1-9af8-4865-8513-256ecc30e651",
          "dcf71994-da3d-46dd-8538-6bd9455d4c99",
          "cd56ffab-4be6-409c-8402-e8d2630bb94f",
        ],
      },
      {
        id: "7556a437-6195-4940-8d60-c8dfa34e9ea7:3",
        text: "Propor uma reflexão breve por meio de uma afirmação e pequeno complemento.",
        dimension: "objective",
        evidenceComponentIds: [
          "7556a437-6195-4940-8d60-c8dfa34e9ea7",
          "f814a87b-01cc-4a22-8d9a-e058a2a492cc",
          "c96847a1-9af8-4865-8513-256ecc30e651",
          "dcf71994-da3d-46dd-8538-6bd9455d4c99",
          "cd56ffab-4be6-409c-8402-e8d2630bb94f",
        ],
      },
      {
        id: "7556a437-6195-4940-8d60-c8dfa34e9ea7:4",
        text: "Resumir o ponto principal em uma conclusão curta e simples.",
        dimension: "objective",
        evidenceComponentIds: [
          "cd57a847-79f5-48b3-8e95-455fbc1ed18f",
          "1785728c-fca5-4859-817d-1faf29189d90",
        ],
      },
    ],
  },
  {
    id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
    familyId: "Screenshot-2026-09-28-23:29:44",
    evidence: {
      sourceId: "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
      sourceHash:
        "3201519b182026cb80daef0395457939e3bdee11463ef21a15b006b27e04009f",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/b7d7323a-73d6-4017-8e33-62f485ae0bf0.json",
      components: [
        {
          id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
          hash: "3201519b182026cb80daef0395457939e3bdee11463ef21a15b006b27e04009f",
        },
        {
          id: "e939c522-20e8-481c-895a-aac4956875bd",
          hash: "a9f95f7e9e017ba6fe93117cc8ad5c58cc6e4c7eb76123b00af8a0b23cb9ac5e",
        },
        {
          id: "d7870fec-1db1-4a93-8547-6414872e630a",
          hash: "3155b6edafcb5abeb283a3e476140d73be74513d7fc56693c904b1e7fb9a0ba5",
        },
        {
          id: "f80bcc04-4aa1-42eb-8d7e-5431c9cea060",
          hash: "b0c4dcccfe22ef859d410f5b8358038300e78789ced7fda17275dc56d7de560a",
        },
        {
          id: "3f957a2d-d4f5-449d-8c9a-77ce507cb932",
          hash: "019787eb60395c8fd1f5a10b854b20b2db805bcfaf123b65f943615309efffaf",
        },
        {
          id: "cf9777fa-13cf-496e-8636-90bd37ec0ce4",
          hash: "562ef343ade0368cb0e8bdfacdfae0db738d897ca156e52b1ed0ae74442ea16d",
        },
        {
          id: "98301060-fc00-4f3b-8373-59ad2a166b39",
          hash: "a6be72e974ca8b329a2289b719bce2b4036296755b7ed3ab3c33f2ac435017e3",
        },
      ],
      composition:
        "Grade modular azul fina sobre fundo creme, blocos azuis sólidos assimétricos e título sans preto grande atravessando células. Subtítulo menor alinhado à direita; grade e espaços vazios participam da hierarquia, com textura original omitida. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 18 camadas em 248×310; fontes Inter.",
    },
    references: [
      {
        id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0:1",
        text: "Destacar um conceito em uma manchete tipográfica com pequena nota de apoio.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
          "e939c522-20e8-481c-895a-aac4956875bd",
          "3f957a2d-d4f5-449d-8c9a-77ce507cb932",
        ],
      },
      {
        id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0:2",
        text: "Organizar uma afirmação breve e subtítulo dentro de uma grade gráfica.",
        dimension: "structure",
        evidenceComponentIds: [
          "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
          "e939c522-20e8-481c-895a-aac4956875bd",
          "d7870fec-1db1-4a93-8547-6414872e630a",
          "3f957a2d-d4f5-449d-8c9a-77ce507cb932",
          "cf9777fa-13cf-496e-8636-90bd37ec0ce4",
        ],
      },
      {
        id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0:3",
        text: "Apresentar uma ideia central de forma sintética, com a tipografia como protagonista.",
        dimension: "objective",
        evidenceComponentIds: [
          "b7d7323a-73d6-4017-8e33-62f485ae0bf0",
          "e939c522-20e8-481c-895a-aac4956875bd",
          "3f957a2d-d4f5-449d-8c9a-77ce507cb932",
        ],
      },
      {
        id: "b7d7323a-73d6-4017-8e33-62f485ae0bf0:4",
        text: "Encerrar com uma mensagem curta que reúna a ideia principal.",
        dimension: "objective",
        evidenceComponentIds: [
          "f80bcc04-4aa1-42eb-8d7e-5431c9cea060",
          "98301060-fc00-4f3b-8373-59ad2a166b39",
        ],
      },
    ],
  },
  {
    id: "63c1c5b4-367b-4721-8588-3394eb48fd77",
    familyId: "ideas-window",
    evidence: {
      sourceId: "63c1c5b4-367b-4721-8588-3394eb48fd77",
      sourceHash:
        "a72eef8f9972ab01a4423ab9708814317dd1958a8fe9008f589423ef0bcdae4e",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/63c1c5b4-367b-4721-8588-3394eb48fd77.json",
      components: [
        {
          id: "63c1c5b4-367b-4721-8588-3394eb48fd77",
          hash: "a72eef8f9972ab01a4423ab9708814317dd1958a8fe9008f589423ef0bcdae4e",
        },
        {
          id: "0ed62d0a-73ce-440a-8cdc-cc7f486a4c59",
          hash: "d53623d5c690171cb88b291f700111b2f587c6d6a7a71e939191b2188c23ee44",
        },
        {
          id: "6e35a33e-3561-4044-8198-622437f018ec",
          hash: "ad45eee8b6309a1e5f9deabee3f20f8d96e3011fe2cf943a352d8f96e821b8ae",
        },
        {
          id: "dbd86c76-beac-4c4d-875c-1e3a809d2ebe",
          hash: "374046e79d1b95657722d3b03f39b821310a640c7c3a59cabb55694b8a3f1078",
        },
        {
          id: "deecd17d-b356-47ec-8139-fbb708b8d3a0",
          hash: "ffc4784971f054f85f2f698267ed898b4500bf55bd48dea23c2f19f310a464cb",
        },
        {
          id: "a02f749b-4f6e-46bf-8cc9-4c271a73fa27",
          hash: "b197faea74bbcc636fafd4b0493da34e03e08af5b83d97c2839833d5d47e83b6",
        },
        {
          id: "7bbc9536-cbd4-4ad5-8a35-aca8c0e8ae33",
          hash: "ec0b27212e74f0fccff34d0b95fe9be7bbf670d322a537bab70dad130523ad88",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 66 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "63c1c5b4-367b-4721-8588-3394eb48fd77:1",
        text: "Apresentar uma explicação curta em um painel com título, apoio e próximo passo.",
        dimension: "structure",
        evidenceComponentIds: [
          "63c1c5b4-367b-4721-8588-3394eb48fd77",
          "6e35a33e-3561-4044-8198-622437f018ec",
          "a02f749b-4f6e-46bf-8cc9-4c271a73fa27",
        ],
      },
      {
        id: "63c1c5b4-367b-4721-8588-3394eb48fd77:2",
        text: "Orientar o leitor com uma ideia de cada vez e instruções concisas.",
        dimension: "objective",
        evidenceComponentIds: [
          "6e35a33e-3561-4044-8198-622437f018ec",
          "a02f749b-4f6e-46bf-8cc9-4c271a73fa27",
        ],
      },
      {
        id: "63c1c5b4-367b-4721-8588-3394eb48fd77:3",
        text: "Organizar a mensagem em blocos claros, destacando o título sobre o apoio textual.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "63c1c5b4-367b-4721-8588-3394eb48fd77",
          "0ed62d0a-73ce-440a-8cdc-cc7f486a4c59",
          "6e35a33e-3561-4044-8198-622437f018ec",
          "deecd17d-b356-47ec-8139-fbb708b8d3a0",
          "a02f749b-4f6e-46bf-8cc9-4c271a73fa27",
        ],
      },
      {
        id: "63c1c5b4-367b-4721-8588-3394eb48fd77:4",
        text: "Fechar com uma síntese curta e convite para a próxima ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "dbd86c76-beac-4c4d-875c-1e3a809d2ebe",
          "7bbc9536-cbd4-4ad5-8a35-aca8c0e8ae33",
        ],
      },
    ],
  },
  {
    id: "b92a1f16-5900-4f10-87c1-685e3b2396a0",
    familyId: "gifts-window",
    evidence: {
      sourceId: "b92a1f16-5900-4f10-87c1-685e3b2396a0",
      sourceHash:
        "892d2a8124c44093a9f09b8ae8afc80322c4a08c92717b40d448ee9a0ce4ca44",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/b92a1f16-5900-4f10-87c1-685e3b2396a0.json",
      components: [
        {
          id: "b92a1f16-5900-4f10-87c1-685e3b2396a0",
          hash: "892d2a8124c44093a9f09b8ae8afc80322c4a08c92717b40d448ee9a0ce4ca44",
        },
        {
          id: "e5f81bfc-5433-4257-815f-4d1245e087ab",
          hash: "0f95d1fba5cd729da5a8c2605340823a14fb88d00fb6eb655b2c272ecd0131e7",
        },
        {
          id: "f993f91f-d03e-46b5-8623-c5a8137b8da9",
          hash: "ea0ba78e7d96c10c192f2903dc4b35de454dc7a336b2d80dc0f8c78572329339",
        },
        {
          id: "80506729-7e2e-4353-8d22-ee85586b1824",
          hash: "dcf9028bc481f84901628190d14581d096abab598954b1038db2b5aa910a4c11",
        },
        {
          id: "d919199d-c82c-4413-82e7-7a1081c3d661",
          hash: "67ae1dd1d1080ec565007f80076857ff8fd1e238a3b244ad22776627f56725d2",
        },
        {
          id: "9eff0a4b-c25d-4be0-826d-b2bf6bfce750",
          hash: "fb8d10c71f4ce75a11d6d342fad65583591cce91207346a58d6b5b802cc4319c",
        },
        {
          id: "a628b450-cdb6-4089-8612-ca2aaf83a23d",
          hash: "7d0db4ecaf7362dc937212e6ee85f4810fa989215fd7415b2c9998975e068b6e",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 1 slots de mídia. 14 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "b92a1f16-5900-4f10-87c1-685e3b2396a0:1",
        text: "Apresentar uma oferta ou convite com fotografia, uma explicação curta e próximo passo.",
        dimension: "objective",
        evidenceComponentIds: [
          "b92a1f16-5900-4f10-87c1-685e3b2396a0",
          "e5f81bfc-5433-4257-815f-4d1245e087ab",
          "f993f91f-d03e-46b5-8623-c5a8137b8da9",
          "80506729-7e2e-4353-8d22-ee85586b1824",
          "d919199d-c82c-4413-82e7-7a1081c3d661",
          "9eff0a4b-c25d-4be0-826d-b2bf6bfce750",
          "a628b450-cdb6-4089-8612-ca2aaf83a23d",
        ],
      },
      {
        id: "b92a1f16-5900-4f10-87c1-685e3b2396a0:2",
        text: "Comentar uma imagem usando título, pequeno parágrafo de apoio e chamada à ação.",
        dimension: "structure",
        evidenceComponentIds: [
          "b92a1f16-5900-4f10-87c1-685e3b2396a0",
          "e5f81bfc-5433-4257-815f-4d1245e087ab",
          "f993f91f-d03e-46b5-8623-c5a8137b8da9",
          "d919199d-c82c-4413-82e7-7a1081c3d661",
          "9eff0a4b-c25d-4be0-826d-b2bf6bfce750",
        ],
      },
      {
        id: "b92a1f16-5900-4f10-87c1-685e3b2396a0:3",
        text: "Explicar uma ideia por página, mantendo a fotografia e desenvolvendo o apoio textual.",
        dimension: "structure",
        evidenceComponentIds: [
          "f993f91f-d03e-46b5-8623-c5a8137b8da9",
          "9eff0a4b-c25d-4be0-826d-b2bf6bfce750",
        ],
      },
      {
        id: "b92a1f16-5900-4f10-87c1-685e3b2396a0:4",
        text: "Destacar uma mensagem com imagem e concluir com um convite claro.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "b92a1f16-5900-4f10-87c1-685e3b2396a0",
          "80506729-7e2e-4353-8d22-ee85586b1824",
          "a628b450-cdb6-4089-8612-ca2aaf83a23d",
        ],
      },
    ],
  },
  {
    id: "189d39d4-b183-4e3f-8965-31994f11f05b",
    familyId: "chromatic-block",
    evidence: {
      sourceId: "189d39d4-b183-4e3f-8965-31994f11f05b",
      sourceHash:
        "e8f40e071da1c53028cb76d7ebe0fa0ed720075d8e9bb8ff522c88eeb862ca24",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/189d39d4-b183-4e3f-8965-31994f11f05b.json",
      components: [
        {
          id: "189d39d4-b183-4e3f-8965-31994f11f05b",
          hash: "e8f40e071da1c53028cb76d7ebe0fa0ed720075d8e9bb8ff522c88eeb862ca24",
        },
        {
          id: "d83afd0a-3aeb-45a3-8c2a-07688baa9f74",
          hash: "d2e06dccdd50fa1612dbcd8ec764ca7a5a2e9e01e870a0ac0205f6f32435cd30",
        },
        {
          id: "dfc47d46-c151-4fe7-8d7a-f513940b92e2",
          hash: "233e95466122ddc46797d2b460a2575d83587bcbba6e97d4602cef5eb982c41d",
        },
        {
          id: "2e15a431-3689-4117-85ce-638bed6e834b",
          hash: "0dc8826b20fe5b86d5aa73018660f43bf93ecd5fd47b021b1dfca3787a733ee7",
        },
        {
          id: "7d37348a-e582-4858-8275-70a31631f98b",
          hash: "2e85c3794fb9a054b81a02d9502cf08991532caa2adc275927569270fd3816c7",
        },
        {
          id: "2de3316e-3c28-48a8-8d77-7f9903b87af2",
          hash: "1549a41d69ac7ddfab90ddaaa88828a71970260b9cb53e64d1e4f66aa28ec7c7",
        },
        {
          id: "0a72a561-e9fa-4062-81d8-2b94e7786e76",
          hash: "6ec80c48135b2529a74fcdd3efe1ac14810100bdfde636ab07fe96920b0886bf",
        },
      ],
      composition:
        "Blocos cromáticos estruturam a composição e a hierarquia do título e apoio. Manter o contraste das áreas, sem deduzir tom editorial das cores.",
    },
    references: [
      {
        id: "189d39d4-b183-4e3f-8965-31994f11f05b:1",
        text: "Comunicar um aviso ou anúncio curto com título e informação de apoio.",
        dimension: "objective",
        evidenceComponentIds: [
          "189d39d4-b183-4e3f-8965-31994f11f05b",
          "d83afd0a-3aeb-45a3-8c2a-07688baa9f74",
          "7d37348a-e582-4858-8275-70a31631f98b",
        ],
      },
      {
        id: "189d39d4-b183-4e3f-8965-31994f11f05b:2",
        text: "Separar título, pequena explicação e etiqueta em blocos de informação.",
        dimension: "structure",
        evidenceComponentIds: [
          "189d39d4-b183-4e3f-8965-31994f11f05b",
          "d83afd0a-3aeb-45a3-8c2a-07688baa9f74",
          "dfc47d46-c151-4fe7-8d7a-f513940b92e2",
          "7d37348a-e582-4858-8275-70a31631f98b",
          "2de3316e-3c28-48a8-8d77-7f9903b87af2",
        ],
      },
      {
        id: "189d39d4-b183-4e3f-8965-31994f11f05b:3",
        text: "Dar destaque visual à mensagem principal por meio de áreas de cor contrastantes.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "189d39d4-b183-4e3f-8965-31994f11f05b",
          "d83afd0a-3aeb-45a3-8c2a-07688baa9f74",
          "7d37348a-e582-4858-8275-70a31631f98b",
        ],
      },
      {
        id: "189d39d4-b183-4e3f-8965-31994f11f05b:4",
        text: "Sintetizar a mensagem em uma frase de destaque e complemento breve.",
        dimension: "objective",
        evidenceComponentIds: [
          "2e15a431-3689-4117-85ce-638bed6e834b",
          "0a72a561-e9fa-4062-81d8-2b94e7786e76",
        ],
      },
    ],
  },
  {
    id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
    familyId: "stroke-impact",
    evidence: {
      sourceId: "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
      sourceHash:
        "bbf7e7eb35ce5ed1ca20fdbb06a2a1fad07b5472a2dc9c91434a7bb22e73724b",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/abbcf9a5-c3f1-4725-8ee5-207c430db40b.json",
      components: [
        {
          id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
          hash: "bbf7e7eb35ce5ed1ca20fdbb06a2a1fad07b5472a2dc9c91434a7bb22e73724b",
        },
        {
          id: "5391897f-abf7-4bc3-85a4-1993fd2fe416",
          hash: "668ed014c936e1dd62737d1a87935da3f5c327d3d0e4237ba793cde45f7fff05",
        },
        {
          id: "c0f57472-1fb9-42be-8d30-dd574f0ae26b",
          hash: "25b055befd59dfabe38d8cf6e4e80e69cfa5c621ce0d3a65487493184cab84c0",
        },
        {
          id: "b8e6907b-6f6d-44b5-8270-56d3d10889d1",
          hash: "fccd389d08dcadbc474df0239f0d92cef0d5bfc8a13fde5ba66c3eeacdccfa2f",
        },
        {
          id: "51814aae-8e0e-4f35-8a9d-8ca63aa3dffa",
          hash: "64945d18bcec176b48fc9038d42a25f7500630c252f144cb4c893d8a4a84b095",
        },
      ],
      composition:
        "Título de impacto com contorno tipográfico; preservar contraste e desenho do contorno nas adaptações de hierarquia.",
    },
    references: [
      {
        id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b:1",
        text: "Valorizar uma frase curta de impacto com letras grandes e contorno tipográfico.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
          "5391897f-abf7-4bc3-85a4-1993fd2fe416",
          "b8e6907b-6f6d-44b5-8270-56d3d10889d1",
        ],
      },
      {
        id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b:2",
        text: "Anunciar uma mudança ou novidade por meio de uma afirmação direta e apoio breve.",
        dimension: "objective",
        evidenceComponentIds: [
          "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
          "5391897f-abf7-4bc3-85a4-1993fd2fe416",
          "b8e6907b-6f6d-44b5-8270-56d3d10889d1",
        ],
      },
      {
        id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b:3",
        text: "Concentrar a comunicação em um título forte e uma explicação curta.",
        dimension: "structure",
        evidenceComponentIds: [
          "abbcf9a5-c3f1-4725-8ee5-207c430db40b",
          "5391897f-abf7-4bc3-85a4-1993fd2fe416",
          "b8e6907b-6f6d-44b5-8270-56d3d10889d1",
        ],
      },
      {
        id: "abbcf9a5-c3f1-4725-8ee5-207c430db40b:4",
        text: "Fechar a sequência reforçando a mensagem central em poucas palavras.",
        dimension: "objective",
        evidenceComponentIds: [
          "c0f57472-1fb9-42be-8d30-dd574f0ae26b",
          "51814aae-8e0e-4f35-8a9d-8ca63aa3dffa",
        ],
      },
    ],
  },
  {
    id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4",
    familyId: "glitch-signal",
    evidence: {
      sourceId: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4",
      sourceHash:
        "1798534952ba102ff8bca4397f2bd774a9e1847c5193f6c2d986f03c7e53d0c5",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4.json",
      components: [
        {
          id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4",
          hash: "1798534952ba102ff8bca4397f2bd774a9e1847c5193f6c2d986f03c7e53d0c5",
        },
        {
          id: "10cba715-e93c-4917-8072-0a3098fbef57",
          hash: "d3cf8d2d7d4d36c19654a5039210417c61428bd75df9f8baf78264a3ea82f0d4",
        },
        {
          id: "650c7d71-05d9-4267-891e-5c11b6523988",
          hash: "e5cc5ca2af7695910df5c37ad195bce55fbae4b81f814297ed67cf249665b360",
        },
        {
          id: "2d09e62c-c4c2-4f2f-8d39-87b1bba96a63",
          hash: "d867d34eb12b010325aac5bd22b4c7e5a9d00cdc845f7d9d289083c73ef17965",
        },
        {
          id: "83541138-04d1-40cb-8bb7-2953f990a008",
          hash: "cabed49c5c1c4088cde7f9839f0fa1f0ffa435eed2213b0b1f6c05c3a7fb83be",
        },
        {
          id: "4a09864d-c62b-44b8-8bc9-04f16d50ba29",
          hash: "ac5a7624f13488bd4dd81d21d002952da641ccf9a392de9f31a42bdf07d21c3a",
        },
        {
          id: "2079b66b-4b80-470c-8849-ee61d5ef8111",
          hash: "84e5743f2e9d2c52a3bc7a000fba61e9881ca4d06b3c875f179ace235ed01098",
        },
      ],
      composition:
        "Interferência gráfica e tipografia marcada estruturam o sinal visual; efeitos são parte do desenho, sem obrigar linguagem informal.",
    },
    references: [
      {
        id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4:1",
        text: "Chamar atenção para uma afirmação com tipografia marcada e interferência gráfica.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4",
          "10cba715-e93c-4917-8072-0a3098fbef57",
          "83541138-04d1-40cb-8bb7-2953f990a008",
        ],
      },
      {
        id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4:2",
        text: "Apresentar uma mensagem de alerta ou mudança, explicando brevemente o motivo.",
        dimension: "objective",
        evidenceComponentIds: [
          "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4",
          "10cba715-e93c-4917-8072-0a3098fbef57",
          "650c7d71-05d9-4267-891e-5c11b6523988",
          "83541138-04d1-40cb-8bb7-2953f990a008",
          "4a09864d-c62b-44b8-8bc9-04f16d50ba29",
        ],
      },
      {
        id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4:3",
        text: "Desenvolver uma ideia por página com título destacado, parágrafo curto e etiqueta.",
        dimension: "structure",
        evidenceComponentIds: [
          "650c7d71-05d9-4267-891e-5c11b6523988",
          "4a09864d-c62b-44b8-8bc9-04f16d50ba29",
        ],
      },
      {
        id: "9a5e0b0d-c2d2-4fad-8415-57c6b26ebab4:4",
        text: "Reforçar a conclusão com uma mensagem concisa visualmente destacada.",
        dimension: "objective",
        evidenceComponentIds: [
          "2d09e62c-c4c2-4f2f-8d39-87b1bba96a63",
          "2079b66b-4b80-470c-8849-ee61d5ef8111",
        ],
      },
    ],
  },
  {
    id: "b132a735-358a-4688-829a-61c18976a1b8",
    familyId: "window-window-requested",
    evidence: {
      sourceId: "b132a735-358a-4688-829a-61c18976a1b8",
      sourceHash:
        "62db7f4b9e9ee14bb6589cbad735ac3753fb9aea97c8e83f54fa5405bd6c6c7f",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/b132a735-358a-4688-829a-61c18976a1b8.json",
      components: [
        {
          id: "b132a735-358a-4688-829a-61c18976a1b8",
          hash: "62db7f4b9e9ee14bb6589cbad735ac3753fb9aea97c8e83f54fa5405bd6c6c7f",
        },
        {
          id: "e31f3c59-a3f8-4cd4-8dd0-34de0bf1329a",
          hash: "05a12af1afefca5fa42d74679e638c5540ea29bdc7f593ed2b9fe4166b996449",
        },
        {
          id: "2071522d-7998-4e9f-8ee2-5035e6e51185",
          hash: "69112789d42d2a32ed986692c9ef609ffdea8011c1709ca72bef318d9ee3d8a9",
        },
        {
          id: "64ca2aac-4b44-4c0c-8452-7ebcb019d085",
          hash: "71a51b08758e5e0193c0121d24d27f4e3190789160fa857fc1d8887d8c922646",
        },
        {
          id: "9050f2eb-5bcd-4b29-840d-cb6a0fc56f97",
          hash: "da860bbb132b803f2600697944fb59f4c8e4b2734eec6776cc64bb0effcd4472",
        },
        {
          id: "9390c080-b3e1-4a78-8390-53aca3f3c776",
          hash: "d80764b2a3f3b3367905fd83511d5fe514101dc2b33f20606e73526f90cd87b6",
        },
        {
          id: "a3d4c8a2-578d-4c4f-8869-3bc2bdbf7ba0",
          hash: "c5059e3a30395c5171c12a3d5874732e65cacc1080d243b3f4e38fa95618cf74",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 3 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 46 camadas em 736×920; fontes Inter, Archivo Black.",
    },
    references: [
      {
        id: "b132a735-358a-4688-829a-61c18976a1b8:1",
        text: "Apresentar uma explicação curta em um painel com título, apoio e próximo passo.",
        dimension: "structure",
        evidenceComponentIds: [
          "b132a735-358a-4688-829a-61c18976a1b8",
          "2071522d-7998-4e9f-8ee2-5035e6e51185",
          "9390c080-b3e1-4a78-8390-53aca3f3c776",
        ],
      },
      {
        id: "b132a735-358a-4688-829a-61c18976a1b8:2",
        text: "Orientar o leitor com uma ideia de cada vez e instruções concisas.",
        dimension: "objective",
        evidenceComponentIds: [
          "2071522d-7998-4e9f-8ee2-5035e6e51185",
          "9390c080-b3e1-4a78-8390-53aca3f3c776",
        ],
      },
      {
        id: "b132a735-358a-4688-829a-61c18976a1b8:3",
        text: "Organizar a mensagem em blocos claros, destacando o título sobre o apoio textual.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "b132a735-358a-4688-829a-61c18976a1b8",
          "e31f3c59-a3f8-4cd4-8dd0-34de0bf1329a",
          "2071522d-7998-4e9f-8ee2-5035e6e51185",
          "9050f2eb-5bcd-4b29-840d-cb6a0fc56f97",
          "9390c080-b3e1-4a78-8390-53aca3f3c776",
        ],
      },
      {
        id: "b132a735-358a-4688-829a-61c18976a1b8:4",
        text: "Fechar com uma síntese curta e convite para a próxima ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "64ca2aac-4b44-4c0c-8452-7ebcb019d085",
          "a3d4c8a2-578d-4c4f-8869-3bc2bdbf7ba0",
        ],
      },
    ],
  },
  {
    id: "9b36720c-b18f-4a9a-81b0-960521610c29",
    familyId: "daily-window",
    evidence: {
      sourceId: "9b36720c-b18f-4a9a-81b0-960521610c29",
      sourceHash:
        "e94ab2e24d5c49622c697f4d12bffd26d35fb0fd53b56ad76719783208c6b214",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/9b36720c-b18f-4a9a-81b0-960521610c29.json",
      components: [
        {
          id: "9b36720c-b18f-4a9a-81b0-960521610c29",
          hash: "e94ab2e24d5c49622c697f4d12bffd26d35fb0fd53b56ad76719783208c6b214",
        },
        {
          id: "2d7a4e5d-9084-42d1-807e-360a9027a0d5",
          hash: "881de5fe8b311be01493f50e47c805a3ff2a8b4f89c14de95f3f44c61a7d4b52",
        },
        {
          id: "170e6793-c1bd-4456-83e3-ac89191e8d15",
          hash: "7d0fb0135fa2c566ab12159f7d6de0a7c2aeb8ebca033c6ba6a44dd83c6cfd7e",
        },
        {
          id: "0a15ef0a-3dbd-447e-89b9-33dcdd06e8fc",
          hash: "a5912709936a883ce8a389dd62006bbf9c70149318765bf6416b20cc4322c2d4",
        },
        {
          id: "db366584-9609-4311-8506-8c7a116be321",
          hash: "e8e37ecccc479602b59538c3f4d39b796e9c6372df7adfc7117b0e55af9fee86",
        },
        {
          id: "740d2e3d-4c9b-4244-8480-54c5534f6680",
          hash: "6ea69865952868ccdcfa7612774c41036c21d0a9791192a432933a11908391be",
        },
        {
          id: "01d08004-d128-46de-853d-33ff4dd5a1c1",
          hash: "750f92d9e7a08d16d39baf01cf738a3e3a9ddbd807c5d18f1a51107a3852f5ed",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 45 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "9b36720c-b18f-4a9a-81b0-960521610c29:1",
        text: "Apresentar uma explicação curta em um painel com título, apoio e próximo passo.",
        dimension: "structure",
        evidenceComponentIds: [
          "9b36720c-b18f-4a9a-81b0-960521610c29",
          "170e6793-c1bd-4456-83e3-ac89191e8d15",
          "740d2e3d-4c9b-4244-8480-54c5534f6680",
        ],
      },
      {
        id: "9b36720c-b18f-4a9a-81b0-960521610c29:2",
        text: "Orientar o leitor com uma ideia de cada vez e instruções concisas.",
        dimension: "objective",
        evidenceComponentIds: [
          "170e6793-c1bd-4456-83e3-ac89191e8d15",
          "740d2e3d-4c9b-4244-8480-54c5534f6680",
        ],
      },
      {
        id: "9b36720c-b18f-4a9a-81b0-960521610c29:3",
        text: "Organizar a mensagem em blocos claros, destacando o título sobre o apoio textual.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "9b36720c-b18f-4a9a-81b0-960521610c29",
          "2d7a4e5d-9084-42d1-807e-360a9027a0d5",
          "170e6793-c1bd-4456-83e3-ac89191e8d15",
          "db366584-9609-4311-8506-8c7a116be321",
          "740d2e3d-4c9b-4244-8480-54c5534f6680",
        ],
      },
      {
        id: "9b36720c-b18f-4a9a-81b0-960521610c29:4",
        text: "Fechar com uma síntese curta e convite para a próxima ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "0a15ef0a-3dbd-447e-89b9-33dcdd06e8fc",
          "01d08004-d128-46de-853d-33ff4dd5a1c1",
        ],
      },
    ],
  },
  {
    id: "ee2fd558-0005-45f2-8066-aef00cb4d034",
    familyId: "data-punch",
    evidence: {
      sourceId: "ee2fd558-0005-45f2-8066-aef00cb4d034",
      sourceHash:
        "9cf8690752d8d7f0e7ab6e0a63e93ef8540c7ec0e93433ea14aa3f4929f37456",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/ee2fd558-0005-45f2-8066-aef00cb4d034.json",
      components: [
        {
          id: "ee2fd558-0005-45f2-8066-aef00cb4d034",
          hash: "9cf8690752d8d7f0e7ab6e0a63e93ef8540c7ec0e93433ea14aa3f4929f37456",
        },
        {
          id: "83bd2bd3-f3b3-4676-836f-329ecdf4beec",
          hash: "aeafaf0e96747ecf0d8c14527c6e05e01abbf486b4d4966abc15aff1f45c751e",
        },
        {
          id: "b0ccc8b1-53b8-4dde-81de-202e771f1738",
          hash: "821939d161a72bd7d9d93c27b25fe6c93176403bdb3544007550284e89afd8b0",
        },
        {
          id: "4d1ab652-e0f1-4a8f-831d-94adf67803c0",
          hash: "98acfbee142ef11b6843b63f8ca0b2367626aa05cf2bb750b2a467a0d4c9ad6e",
        },
        {
          id: "36fca5fb-3251-4617-85ed-4f1271c7a7df",
          hash: "7d46e21c5511a11b814ded5965260e41318eafb13e77bc63faef07e4a0a885e4",
        },
      ],
      composition:
        "Valor numérico de grande destaque acompanhado de título e explicação. A métrica deve vir do insumo; seu tamanho visual não autoriza inventar números.",
    },
    references: [
      {
        id: "ee2fd558-0005-45f2-8066-aef00cb4d034:1",
        text: "Dar destaque a um número ou percentual informado no pedido, com título que o contextualize.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "ee2fd558-0005-45f2-8066-aef00cb4d034",
          "83bd2bd3-f3b3-4676-836f-329ecdf4beec",
          "4d1ab652-e0f1-4a8f-831d-94adf67803c0",
        ],
      },
      {
        id: "ee2fd558-0005-45f2-8066-aef00cb4d034:2",
        text: "Comunicar um resultado mensurável já fornecido, destacando o indicador principal.",
        dimension: "objective",
        evidenceComponentIds: [
          "ee2fd558-0005-45f2-8066-aef00cb4d034",
          "83bd2bd3-f3b3-4676-836f-329ecdf4beec",
          "4d1ab652-e0f1-4a8f-831d-94adf67803c0",
        ],
      },
      {
        id: "ee2fd558-0005-45f2-8066-aef00cb4d034:3",
        text: "Organizar uma métrica central e uma breve explicação do que ela representa.",
        dimension: "structure",
        evidenceComponentIds: [
          "ee2fd558-0005-45f2-8066-aef00cb4d034",
          "83bd2bd3-f3b3-4676-836f-329ecdf4beec",
          "4d1ab652-e0f1-4a8f-831d-94adf67803c0",
        ],
      },
      {
        id: "ee2fd558-0005-45f2-8066-aef00cb4d034:4",
        text: "Concluir destacando o dado principal disponível, acompanhado de uma síntese curta.",
        dimension: "objective",
        evidenceComponentIds: [
          "b0ccc8b1-53b8-4dde-81de-202e771f1738",
          "36fca5fb-3251-4617-85ed-4f1271c7a7df",
        ],
      },
    ],
  },
  {
    id: "0161174b-436d-4fb3-81bc-774ecb2652ac",
    familyId: "mosaic-grid",
    evidence: {
      sourceId: "0161174b-436d-4fb3-81bc-774ecb2652ac",
      sourceHash:
        "7ab4dbd8fcb8a71201b0016e35612c6cb66670e218207f9de7abdb7250461f73",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/0161174b-436d-4fb3-81bc-774ecb2652ac.json",
      components: [
        {
          id: "0161174b-436d-4fb3-81bc-774ecb2652ac",
          hash: "7ab4dbd8fcb8a71201b0016e35612c6cb66670e218207f9de7abdb7250461f73",
        },
        {
          id: "7669b23e-a2ed-4683-81d7-82d6b6ea2ce4",
          hash: "31e2d07e91545eae519c318032a19842499207f12af04e1790fae497ee5c5985",
        },
        {
          id: "2d6dde5e-29c1-443b-8dad-92964c763c21",
          hash: "b6549daf1c4aed0993773065b90dcde91c4417f2ad64c81c5870448eea320705",
        },
        {
          id: "717f9c8a-6945-416b-8094-ba86de3c8871",
          hash: "1100270049b653b359f96e37eb5912c6533e297d90475629f1eda72211bfe297",
        },
        {
          id: "8ccb4654-0e15-4298-88f8-5ef561ac5246",
          hash: "a596fff09ed2bec3a4b9dc417bf3a8ef72203f9bb3e8d852a49cd83fc6e48418",
        },
        {
          id: "e86e5778-9f37-4c45-8c78-fb284e9cbf2a",
          hash: "0e03140acb0332afb4968d96c4878ab5c857cd12193bdca84edffe5968b16e10",
        },
        {
          id: "c36c9875-3117-4936-8de4-1334b56c2b33",
          hash: "23b571c234e8d1cacb7e681a2ac089ef27981833ad206f6045d8245cb59864de",
        },
      ],
      composition:
        "Título amplo sobre três cartões independentes alinhados. Os cartões organizam três ideias paralelas; as duas linhas de cada cartão pertencem à mesma ideia.",
    },
    references: [
      {
        id: "0161174b-436d-4fb3-81bc-774ecb2652ac:1",
        text: "Organizar três ideias independentes em cartões, cada uma com seu próprio texto.",
        dimension: "structure",
        evidenceComponentIds: [
          "0161174b-436d-4fb3-81bc-774ecb2652ac",
          "7669b23e-a2ed-4683-81d7-82d6b6ea2ce4",
          "2d6dde5e-29c1-443b-8dad-92964c763c21",
          "8ccb4654-0e15-4298-88f8-5ef561ac5246",
          "e86e5778-9f37-4c45-8c78-fb284e9cbf2a",
        ],
      },
      {
        id: "0161174b-436d-4fb3-81bc-774ecb2652ac:2",
        text: "Ensinar recomendações ou etapas por meio de itens separados e fáceis de percorrer.",
        dimension: "objective",
        evidenceComponentIds: [
          "7669b23e-a2ed-4683-81d7-82d6b6ea2ce4",
          "2d6dde5e-29c1-443b-8dad-92964c763c21",
          "8ccb4654-0e15-4298-88f8-5ef561ac5246",
          "e86e5778-9f37-4c45-8c78-fb284e9cbf2a",
        ],
      },
      {
        id: "0161174b-436d-4fb3-81bc-774ecb2652ac:3",
        text: "Explicar três pontos em paralelo, desenvolvendo cada um em sua própria área.",
        dimension: "structure",
        evidenceComponentIds: [
          "2d6dde5e-29c1-443b-8dad-92964c763c21",
          "717f9c8a-6945-416b-8094-ba86de3c8871",
          "e86e5778-9f37-4c45-8c78-fb284e9cbf2a",
          "c36c9875-3117-4936-8de4-1334b56c2b33",
        ],
      },
      {
        id: "0161174b-436d-4fb3-81bc-774ecb2652ac:4",
        text: "Dar peso visual semelhante a três argumentos, sob um título comum.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "0161174b-436d-4fb3-81bc-774ecb2652ac",
          "7669b23e-a2ed-4683-81d7-82d6b6ea2ce4",
          "2d6dde5e-29c1-443b-8dad-92964c763c21",
          "717f9c8a-6945-416b-8094-ba86de3c8871",
          "8ccb4654-0e15-4298-88f8-5ef561ac5246",
          "e86e5778-9f37-4c45-8c78-fb284e9cbf2a",
          "c36c9875-3117-4936-8de4-1334b56c2b33",
        ],
      },
    ],
  },
  {
    id: "b0693214-95fe-483f-88e4-6210208b2a85",
    familyId: "kinetic-type",
    evidence: {
      sourceId: "b0693214-95fe-483f-88e4-6210208b2a85",
      sourceHash:
        "eee92dd4d72f261b652b6962fc162c27f65258b2fda09c5ce78c08f5d87c5720",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/b0693214-95fe-483f-88e4-6210208b2a85.json",
      components: [
        {
          id: "b0693214-95fe-483f-88e4-6210208b2a85",
          hash: "eee92dd4d72f261b652b6962fc162c27f65258b2fda09c5ce78c08f5d87c5720",
        },
        {
          id: "2a043839-c699-4ad9-8381-841747186054",
          hash: "a476093e2d941179fd595d640f2adf681ee9e8f2bb6cda30f479dd19a6956d50",
        },
        {
          id: "b1b8156f-7204-49c0-870a-13212ea718fd",
          hash: "e7c64334d444a7f5ea20302fadbfde8522bf097e299762e0a34e4bdaecdae70e",
        },
        {
          id: "4129427d-667a-4c64-84fd-97f81f4c91bc",
          hash: "a57ab1b711756b616a3442833cfd9ea475e95d951e007b9b557350aeb851ef95",
        },
        {
          id: "8b784744-6bf2-462a-8db0-a18381741401",
          hash: "34fe7880e191678d5ee6bc7a568875ee3748ae866c7a4457d10b3e4f98ed6ea4",
        },
      ],
      composition:
        "Tipografia expressiva como protagonista; preservar relações entre fragmentos e efeitos do título. A escala visual não significa espaço para explicação longa.",
    },
    references: [
      {
        id: "b0693214-95fe-483f-88e4-6210208b2a85:1",
        text: "Transformar uma frase curta em protagonista com tipografia expressiva.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "b0693214-95fe-483f-88e4-6210208b2a85",
          "2a043839-c699-4ad9-8381-841747186054",
          "4129427d-667a-4c64-84fd-97f81f4c91bc",
        ],
      },
      {
        id: "b0693214-95fe-483f-88e4-6210208b2a85:2",
        text: "Comunicar uma ideia marcante ou manifesto breve, com pequeno complemento.",
        dimension: "objective",
        evidenceComponentIds: [
          "b0693214-95fe-483f-88e4-6210208b2a85",
          "2a043839-c699-4ad9-8381-841747186054",
          "4129427d-667a-4c64-84fd-97f81f4c91bc",
        ],
      },
      {
        id: "b0693214-95fe-483f-88e4-6210208b2a85:3",
        text: "Organizar a mensagem em um título de destaque e apoio conciso.",
        dimension: "structure",
        evidenceComponentIds: [
          "b0693214-95fe-483f-88e4-6210208b2a85",
          "2a043839-c699-4ad9-8381-841747186054",
          "4129427d-667a-4c64-84fd-97f81f4c91bc",
        ],
      },
      {
        id: "b0693214-95fe-483f-88e4-6210208b2a85:4",
        text: "Encerrar com uma afirmação forte que sintetize a mensagem.",
        dimension: "objective",
        evidenceComponentIds: [
          "b1b8156f-7204-49c0-870a-13212ea718fd",
          "8b784744-6bf2-462a-8db0-a18381741401",
        ],
      },
    ],
  },
  {
    id: "b5e7822f-8163-437f-81e7-7fea73cbe87d",
    familyId: "cinematic-depth",
    evidence: {
      sourceId: "b5e7822f-8163-437f-81e7-7fea73cbe87d",
      sourceHash:
        "288f6e1e4308ec24e046f0bd66ecd966a8140b1e870ff3010a270e8d7808ba60",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/b5e7822f-8163-437f-81e7-7fea73cbe87d.json",
      components: [
        {
          id: "b5e7822f-8163-437f-81e7-7fea73cbe87d",
          hash: "288f6e1e4308ec24e046f0bd66ecd966a8140b1e870ff3010a270e8d7808ba60",
        },
        {
          id: "dae7d3ee-cded-43bf-8b89-6e22152ffe84",
          hash: "75d0c8832cfabf698bab0b56ef33ed061dd3bf4a41ae6d00377da612039d7f60",
        },
        {
          id: "1cc1268a-34fb-4b87-8425-b03364c21d60",
          hash: "c4de9e175d0e560b1f00f4566f0b5894371501cca79490edb04095e7a1a61a37",
        },
        {
          id: "aaad8dd7-193b-4c24-862b-d20c3dc21618",
          hash: "3ebb0af4317028ff045385a630faa1fd655f1542b389d2188e069991add4e0a8",
        },
        {
          id: "04a37df9-08b8-4fc1-8158-a41d30e4ade0",
          hash: "a1a09caf57cb96a76da1c58db6b915fbc28aaf198bb8b399de8f0cab368a192f",
        },
      ],
      composition:
        "Imagem e atmosfera de pôster com hierarquia textual de cinema. A mídia faz parte da mensagem e depende de imagem adequada ao briefing.",
    },
    references: [
      {
        id: "b5e7822f-8163-437f-81e7-7fea73cbe87d:1",
        text: "Apresentar um lançamento ou evento em formato de pôster, com título e descrição breve.",
        dimension: "objective",
        evidenceComponentIds: [
          "b5e7822f-8163-437f-81e7-7fea73cbe87d",
          "dae7d3ee-cded-43bf-8b89-6e22152ffe84",
          "aaad8dd7-193b-4c24-862b-d20c3dc21618",
        ],
      },
      {
        id: "b5e7822f-8163-437f-81e7-7fea73cbe87d:2",
        text: "Dar à mensagem central hierarquia de cartaz, com título em destaque e atmosfera visual.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "b5e7822f-8163-437f-81e7-7fea73cbe87d",
          "dae7d3ee-cded-43bf-8b89-6e22152ffe84",
          "aaad8dd7-193b-4c24-862b-d20c3dc21618",
        ],
      },
      {
        id: "b5e7822f-8163-437f-81e7-7fea73cbe87d:3",
        text: "Introduzir uma narrativa com título e uma breve sinopse.",
        dimension: "structure",
        evidenceComponentIds: [
          "b5e7822f-8163-437f-81e7-7fea73cbe87d",
          "dae7d3ee-cded-43bf-8b89-6e22152ffe84",
          "aaad8dd7-193b-4c24-862b-d20c3dc21618",
        ],
      },
      {
        id: "b5e7822f-8163-437f-81e7-7fea73cbe87d:4",
        text: "Concluir com uma frase marcante e curto complemento no mesmo estilo de pôster.",
        dimension: "objective",
        evidenceComponentIds: [
          "1cc1268a-34fb-4b87-8425-b03364c21d60",
          "04a37df9-08b8-4fc1-8158-a41d30e4ade0",
        ],
      },
    ],
  },
  {
    id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610",
    familyId: "ideas-paper",
    evidence: {
      sourceId: "c6b9eb85-a388-4ec5-8d1c-eab55da08610",
      sourceHash:
        "4f04d1a8a3dcc04046c5df4b539483a78e555ae0dc5be4ef6d8e643a0a19133d",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/c6b9eb85-a388-4ec5-8d1c-eab55da08610.json",
      components: [
        {
          id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610",
          hash: "4f04d1a8a3dcc04046c5df4b539483a78e555ae0dc5be4ef6d8e643a0a19133d",
        },
        {
          id: "aaa54301-0dce-4e28-818e-c6bca9ca8cad",
          hash: "2519d7b3a6297eae7a1dda98a8e1ff2eb9227e902425645f497977bc038599e0",
        },
        {
          id: "6cd020bc-4900-40f3-8f8e-e74960b2756b",
          hash: "a30eebf631021c64c9c5d79f41e8f10c567ec73022942e04a50884df0790b749",
        },
        {
          id: "4b852f6a-a6c5-4efb-8664-00b913e0fcf1",
          hash: "d9792271bbe4bfb1f897b0a0e6458e7b2550ad743624b4a1f0e546743834d178",
        },
        {
          id: "c9aa0397-807f-4fc2-88eb-5994185581e4",
          hash: "9154935dc5a73514b9434fafac09fe1f5028e877517cb4dbbc15b35f02698f6c",
        },
        {
          id: "669e2114-545d-49ac-85a3-49408e1a3868",
          hash: "382942555b736c0bf6e44059d3163e9063993a8fd77a41f903d1ef0d06b32725",
        },
        {
          id: "de55f8fc-7e0c-4f68-84d7-a73525e11e28",
          hash: "d351658f5d9f0bdd647a06d3e20b7d374465d35a49da6c204092b98e63b7ec58",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 66 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "6cd020bc-4900-40f3-8f8e-e74960b2756b",
          "669e2114-545d-49ac-85a3-49408e1a3868",
        ],
      },
      {
        id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "6cd020bc-4900-40f3-8f8e-e74960b2756b",
          "669e2114-545d-49ac-85a3-49408e1a3868",
        ],
      },
      {
        id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "c6b9eb85-a388-4ec5-8d1c-eab55da08610",
          "aaa54301-0dce-4e28-818e-c6bca9ca8cad",
          "6cd020bc-4900-40f3-8f8e-e74960b2756b",
          "c9aa0397-807f-4fc2-88eb-5994185581e4",
          "669e2114-545d-49ac-85a3-49408e1a3868",
        ],
      },
      {
        id: "c6b9eb85-a388-4ec5-8d1c-eab55da08610:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "4b852f6a-a6c5-4efb-8664-00b913e0fcf1",
          "de55f8fc-7e0c-4f68-84d7-a73525e11e28",
        ],
      },
    ],
  },
  {
    id: "6377a8db-73bc-4eb5-88eb-6d63d868431e",
    familyId: "daily-paper",
    evidence: {
      sourceId: "6377a8db-73bc-4eb5-88eb-6d63d868431e",
      sourceHash:
        "a3e9bcbc2d82c779703ef44f98129e6aa763a2543a6113bb2857e884c6dc3348",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/6377a8db-73bc-4eb5-88eb-6d63d868431e.json",
      components: [
        {
          id: "6377a8db-73bc-4eb5-88eb-6d63d868431e",
          hash: "a3e9bcbc2d82c779703ef44f98129e6aa763a2543a6113bb2857e884c6dc3348",
        },
        {
          id: "d5eaf3e4-497a-47d8-8921-94f165ffc057",
          hash: "7517bf0255335dfb640594cdd843d67e13f083272f3e352ec8fc53eccdedee84",
        },
        {
          id: "0cab38dd-4056-44b8-81e7-33fd2376fa3b",
          hash: "3124c43724f5e78f26a3742d7df07508a8c50d71229b8356cfc7f416d5c70e82",
        },
        {
          id: "0bf6e740-6bd2-449c-8145-6dfa3af18af5",
          hash: "286b3632e44d8c308c1b83955ef2cb4b709fdb6cfe40d12f4b199a0aaee7644e",
        },
        {
          id: "2af0857e-2d70-4ed2-86a0-4f0ab214a4bb",
          hash: "952e5b118677797b0abe2d70427a5c18c595a9532c8771a59d6a6e3ca689067b",
        },
        {
          id: "0b2ac188-8199-4ce2-8a3e-0cea67a066cc",
          hash: "00449246928c0dad603246659b7983cd5f6a8c7477369df896dbff621f93a55a",
        },
        {
          id: "0855d5ba-9bcc-4b64-8eb5-6ed46f5d0539",
          hash: "00dba049878be66bef2ca96cbb422d1761bb1dca8ccd5bbec8b3b2fb84755f57",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 45 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "6377a8db-73bc-4eb5-88eb-6d63d868431e:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "0cab38dd-4056-44b8-81e7-33fd2376fa3b",
          "0b2ac188-8199-4ce2-8a3e-0cea67a066cc",
        ],
      },
      {
        id: "6377a8db-73bc-4eb5-88eb-6d63d868431e:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "0cab38dd-4056-44b8-81e7-33fd2376fa3b",
          "0b2ac188-8199-4ce2-8a3e-0cea67a066cc",
        ],
      },
      {
        id: "6377a8db-73bc-4eb5-88eb-6d63d868431e:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "6377a8db-73bc-4eb5-88eb-6d63d868431e",
          "d5eaf3e4-497a-47d8-8921-94f165ffc057",
          "0cab38dd-4056-44b8-81e7-33fd2376fa3b",
          "2af0857e-2d70-4ed2-86a0-4f0ab214a4bb",
          "0b2ac188-8199-4ce2-8a3e-0cea67a066cc",
        ],
      },
      {
        id: "6377a8db-73bc-4eb5-88eb-6d63d868431e:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "0bf6e740-6bd2-449c-8145-6dfa3af18af5",
          "0855d5ba-9bcc-4b64-8eb5-6ed46f5d0539",
        ],
      },
    ],
  },
  {
    id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2",
    familyId: "paper-paper-requested",
    evidence: {
      sourceId: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2",
      sourceHash:
        "679e65f33c784777602cf2e0111c57b9f18b177a84081213987a6073b250d70c",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/9ed999d2-1a2d-4bcd-800c-72feb58f2da2.json",
      components: [
        {
          id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2",
          hash: "679e65f33c784777602cf2e0111c57b9f18b177a84081213987a6073b250d70c",
        },
        {
          id: "e0cd0187-20bc-4915-8fb2-8fe4e2030650",
          hash: "a61c5ec94f4002466cd681afb2fe7c2d9166731b625f6d187d2e4a273a1f8c79",
        },
        {
          id: "512fd931-39ea-4b40-84a8-f3e6b7c99a52",
          hash: "5d7f99affb1e5fe19baea615ecbad2cde089b6624e5aae6746a1e826895900f2",
        },
        {
          id: "6bfa8009-4598-4668-8795-59ae01646dc2",
          hash: "bb3205fdaca583099983b143766200f7894be600aa3f66d6eb63a7376ef1de5e",
        },
        {
          id: "a011caee-955a-4c9c-804e-b5069cfcfef1",
          hash: "aa845f178e59e70ef209c69055b182bb57a31397cef8663c5eccb100c72a8e22",
        },
        {
          id: "b1b3cded-246b-424a-814a-605f994c71a4",
          hash: "7994d1fe80658eb7a28821e3880961b3d7cd65382c430e8f376e97296517b672",
        },
        {
          id: "ddf34fa7-4d89-4980-8eb2-99cf679fb68b",
          hash: "fef190dfdd061127f113244be792c665824a4d38fb3ecdf7c5abae2589774195",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 66 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "512fd931-39ea-4b40-84a8-f3e6b7c99a52",
          "b1b3cded-246b-424a-814a-605f994c71a4",
        ],
      },
      {
        id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "512fd931-39ea-4b40-84a8-f3e6b7c99a52",
          "b1b3cded-246b-424a-814a-605f994c71a4",
        ],
      },
      {
        id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "9ed999d2-1a2d-4bcd-800c-72feb58f2da2",
          "e0cd0187-20bc-4915-8fb2-8fe4e2030650",
          "512fd931-39ea-4b40-84a8-f3e6b7c99a52",
          "a011caee-955a-4c9c-804e-b5069cfcfef1",
          "b1b3cded-246b-424a-814a-605f994c71a4",
        ],
      },
      {
        id: "9ed999d2-1a2d-4bcd-800c-72feb58f2da2:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "6bfa8009-4598-4668-8795-59ae01646dc2",
          "ddf34fa7-4d89-4980-8eb2-99cf679fb68b",
        ],
      },
    ],
  },
  {
    id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27",
    familyId: "paper-window-requested",
    evidence: {
      sourceId: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27",
      sourceHash:
        "83d8e557e251d30996f03f97aa59c19a1e85e797c414be52a59a2b3d7a8e0092",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/fec070ec-d7f5-492c-8a8b-50bdda5d7d27.json",
      components: [
        {
          id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27",
          hash: "83d8e557e251d30996f03f97aa59c19a1e85e797c414be52a59a2b3d7a8e0092",
        },
        {
          id: "1313e436-f113-4e57-8424-cd887be33089",
          hash: "c9ff58b34b5e1619ffb498ac92de6314df6728e43dc90d493314b9ffee4de974",
        },
        {
          id: "e30bf402-5590-49be-80ef-368b5127f703",
          hash: "cfce68fd63ae9de7bba021e93fb998e28749bf3897683a6e2b6513fd7e2b8032",
        },
        {
          id: "1686cae3-e662-4a7e-8055-14168afac830",
          hash: "c2d2116db696cf0ba4264e710927d284943922f1db95957b2ad3963e10cd237a",
        },
        {
          id: "706a14e9-a174-42f4-88b7-8c7dde0cb7fa",
          hash: "e5440f898e44d8b0a1adc9a1414fd776638ad10b81a1630acf69dfd8f0bd7dab",
        },
        {
          id: "a98ea92f-67ff-4ef8-8013-b57c82c39245",
          hash: "67cc3791fa0bf4d1479b502560c821beb19b6eedac657d2d21df5fbf6202fda5",
        },
        {
          id: "42b4bd56-d4c1-4a08-81f4-828fbecc5602",
          hash: "f42155fa827585b9b1b2f10ead101d9b6f7e142e7bbc44a0cd2da992c542ddd4",
        },
      ],
      composition:
        "Janela com moldura, controles e organização de conteúdo no painel nativo. 3 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 67 camadas em 736×920; fontes Inter, Archivo Black.",
    },
    references: [
      {
        id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27:1",
        text: "Explicar um assunto em parágrafos curtos com desenvolvimento contínuo da ideia.",
        dimension: "objective",
        evidenceComponentIds: [
          "e30bf402-5590-49be-80ef-368b5127f703",
          "a98ea92f-67ff-4ef8-8013-b57c82c39245",
        ],
      },
      {
        id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27:2",
        text: "Organizar uma progressão explicativa de título compacto e texto principal dentro de um painel.",
        dimension: "structure",
        evidenceComponentIds: [
          "e30bf402-5590-49be-80ef-368b5127f703",
          "a98ea92f-67ff-4ef8-8013-b57c82c39245",
        ],
      },
      {
        id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27:3",
        text: "Priorizar a leitura e a explicação sobre uma manchete isolada.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "e30bf402-5590-49be-80ef-368b5127f703",
          "a98ea92f-67ff-4ef8-8013-b57c82c39245",
        ],
      },
      {
        id: "fec070ec-d7f5-492c-8a8b-50bdda5d7d27:4",
        text: "Reunir os pontos explicados em uma síntese que prepara o próximo passo.",
        dimension: "objective",
        evidenceComponentIds: [
          "1686cae3-e662-4a7e-8055-14168afac830",
          "42b4bd56-d4c1-4a08-81f4-828fbecc5602",
        ],
      },
    ],
  },
  {
    id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951",
    familyId: "window-paper-requested",
    evidence: {
      sourceId: "49ba7d37-41f8-4a7e-8223-71ecc1fef951",
      sourceHash:
        "e726ab8d9f4814db85814b90749cb3e30f0801151aff8252986dffa619aaa101",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/49ba7d37-41f8-4a7e-8223-71ecc1fef951.json",
      components: [
        {
          id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951",
          hash: "e726ab8d9f4814db85814b90749cb3e30f0801151aff8252986dffa619aaa101",
        },
        {
          id: "69864c1e-253b-4366-8c07-57ec9510e461",
          hash: "16a55713b76f525b5ee1ee491c6c8c9274011f23b1ae1da5b7119edd2b2ccd83",
        },
        {
          id: "ed0bd94c-51fc-4c53-85f5-4160d759cca7",
          hash: "1fa422ef6091fa87a0dd1e3738c02dd4658eb2b3d6ed849082edc02a703b26f0",
        },
        {
          id: "62374fdf-d55c-40f7-8a4f-3a0da448b963",
          hash: "57a59e865dc9d4f6fc5bed323f27739ab1825d04bfcacf27d95817bc9e903eee",
        },
        {
          id: "28f2d4de-8c0e-4b6c-8bae-34b1e61a3125",
          hash: "fe6b3c5ac160aa6219552ed3014647a7d51b251b15f5bb7971e299e2c2ce1949",
        },
        {
          id: "7ea15039-804d-4fde-8ec9-7ee52b4efdab",
          hash: "964895bd6c860a5eda2f132624f6d276657d40aa04ee31521bdc8358770be6f3",
        },
        {
          id: "1ae96b82-b7d5-425b-897a-c22cd14b26e1",
          hash: "c7b5ba22cb544de27172ba240a62ed4f74866c34eafe09ea3da66a022f9834ac",
        },
      ],
      composition:
        "Camadas de papel sobrepostas preservam a assinatura editorial. 2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 45 camadas em 736×920; fontes Inter, Anton.",
    },
    references: [
      {
        id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951:1",
        text: "Explicar uma ideia em texto, desenvolvendo o motivo e uma orientação útil.",
        dimension: "objective",
        evidenceComponentIds: [
          "ed0bd94c-51fc-4c53-85f5-4160d759cca7",
          "7ea15039-804d-4fde-8ec9-7ee52b4efdab",
        ],
      },
      {
        id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951:2",
        text: "Organizar uma sequência de parágrafos curtos, cada página aprofundando uma ideia.",
        dimension: "structure",
        evidenceComponentIds: [
          "ed0bd94c-51fc-4c53-85f5-4160d759cca7",
          "7ea15039-804d-4fde-8ec9-7ee52b4efdab",
        ],
      },
      {
        id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951:3",
        text: "Apresentar uma afirmação central acompanhada de justificativa breve.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "49ba7d37-41f8-4a7e-8223-71ecc1fef951",
          "69864c1e-253b-4366-8c07-57ec9510e461",
          "ed0bd94c-51fc-4c53-85f5-4160d759cca7",
          "28f2d4de-8c0e-4b6c-8bae-34b1e61a3125",
          "7ea15039-804d-4fde-8ec9-7ee52b4efdab",
        ],
      },
      {
        id: "49ba7d37-41f8-4a7e-8223-71ecc1fef951:4",
        text: "Sintetizar o que foi explicado e apresentar o próximo passo em uma chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "62374fdf-d55c-40f7-8a4f-3a0da448b963",
          "1ae96b82-b7d5-425b-897a-c22cd14b26e1",
        ],
      },
    ],
  },
  {
    id: "10f85079-4bcf-4d58-8072-fb7665a5d39c",
    familyId: "paper-ribbons-requested",
    evidence: {
      sourceId: "10f85079-4bcf-4d58-8072-fb7665a5d39c",
      sourceHash:
        "ac72d9d2a345de9d560fa7c3e885e115e865d3f2e3ad65b0b0f30dc2fc4fec15",
      sourcePath:
        "artifacts/complete-designs/catalog-repertoire-2026-11-01-v3-r9/definitions/10f85079-4bcf-4d58-8072-fb7665a5d39c.json",
      components: [
        {
          id: "10f85079-4bcf-4d58-8072-fb7665a5d39c",
          hash: "ac72d9d2a345de9d560fa7c3e885e115e865d3f2e3ad65b0b0f30dc2fc4fec15",
        },
        {
          id: "bb0c322b-d07d-45eb-89ee-d40d2a9d62c8",
          hash: "62828d6395adb49b858eace86b1f52457bbb49d748bfc66a175171afe5a93b8f",
        },
        {
          id: "792ec04f-4feb-4ace-894a-678d0a55a538",
          hash: "9d014e9e506a74807f0e247a90eebaa47c8b985b3aa93f18fc735e808935d3bf",
        },
        {
          id: "8de056a8-b53c-4d0d-8f9e-cc86e017ee34",
          hash: "84641533e813831f1440316900fdb38a47940a30cdb871c269d10a77930743ef",
        },
        {
          id: "ce8483d2-b289-4f88-8be5-7a11db01c74e",
          hash: "eed1a7349ed9b454ec4adfa8f0be5136fbafec446f9a9afcf942b639cf6dd462",
        },
      ],
      composition:
        "2 regiões de título, 1 apoios textuais, 0 listas semânticas e 0 slots de mídia. 64 camadas em 736×920; fontes Inter.",
    },
    references: [
      {
        id: "10f85079-4bcf-4d58-8072-fb7665a5d39c:1",
        text: "Anunciar uma novidade com título breve, uma linha de apoio e convite.",
        dimension: "objective",
        evidenceComponentIds: [
          "10f85079-4bcf-4d58-8072-fb7665a5d39c",
          "bb0c322b-d07d-45eb-89ee-d40d2a9d62c8",
          "8de056a8-b53c-4d0d-8f9e-cc86e017ee34",
        ],
      },
      {
        id: "10f85079-4bcf-4d58-8072-fb7665a5d39c:2",
        text: "Apresentar uma única ideia em destaque, seguida de uma explicação muito curta.",
        dimension: "structure",
        evidenceComponentIds: [
          "10f85079-4bcf-4d58-8072-fb7665a5d39c",
          "bb0c322b-d07d-45eb-89ee-d40d2a9d62c8",
          "8de056a8-b53c-4d0d-8f9e-cc86e017ee34",
        ],
      },
      {
        id: "10f85079-4bcf-4d58-8072-fb7665a5d39c:3",
        text: "Chamar atenção para a mensagem principal e deixar o próximo passo visível.",
        dimension: "emphasis",
        evidenceComponentIds: [
          "10f85079-4bcf-4d58-8072-fb7665a5d39c",
          "bb0c322b-d07d-45eb-89ee-d40d2a9d62c8",
          "792ec04f-4feb-4ace-894a-678d0a55a538",
          "8de056a8-b53c-4d0d-8f9e-cc86e017ee34",
          "ce8483d2-b289-4f88-8be5-7a11db01c74e",
        ],
      },
      {
        id: "10f85079-4bcf-4d58-8072-fb7665a5d39c:4",
        text: "Concluir com uma síntese concisa e chamada à ação.",
        dimension: "objective",
        evidenceComponentIds: [
          "792ec04f-4feb-4ace-894a-678d0a55a538",
          "ce8483d2-b289-4f88-8be5-7a11db01c74e",
        ],
      },
    ],
  },
];

/** Unknown or changed catalogue data is neutral; never infer a match by name.
 * Only references supported by at least one actually offered composition remain. */
export function findEditorialCatalogProfile(
  identity: EditorialCatalogIdentity
): EditorialCatalogProfile | undefined {
  const profile = editorialCatalogProfiles.find(
    p => p.id === identity.sourceId
  );
  if (
    !profile ||
    profile.familyId !== identity.family ||
    profile.evidence.sourceHash !== identity.sourceHash
  )
    return undefined;
  const offered = identity.components ?? [
    { id: identity.sourceId, hash: identity.sourceHash },
  ];
  if (
    !offered.length ||
    !offered.some(
      c => c.id === identity.sourceId && c.hash === identity.sourceHash
    )
  )
    return undefined;
  const known = new Map(profile.evidence.components.map(c => [c.id, c.hash]));
  if (offered.some(c => known.get(c.id) !== c.hash)) return undefined;
  const ids = new Set(offered.map(c => c.id));
  const references = profile.references.filter(r =>
    r.evidenceComponentIds.some(id => ids.has(id))
  );
  if (!references.length) return undefined;
  return { ...profile, references };
}
