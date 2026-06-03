// levels.js — mondes & niveaux (level design original).
// Légende des tuiles:
//  ' ' vide | X sol | H bloc dur | B brique | ? bloc(pièce) | M bloc(power-up) | U bloc(étoile)
//  p corps de tuyau | P tête de tuyau | ^ pics | = plateforme | o pièce | G arrivée
//  S départ joueur | g marcheur | k ennemi à carapace | f volant

export const WORLDS = [
  {
    name: 'Plaines de Bolt',
    levels: [
      {
        name: '1-1 Premiers pas', theme: 'overworld', time: 300,
        map: [
          '                                                                                            ',
          '                                                                                            ',
          '          o o o                            o o                                              ',
          '                        ?                 ?  ?                          o o o                ',
          '                                                          P                                  ',
          '            ?  B?B           o o          BB?BB          pp        BMB                       ',
          '                                  g                      pp                                  ',
          '                       g                          g      pp           f                     ',
          '                  ===            ^^          g           pp                   o o o          ',
          'S        g                  XXX      XXX           XXX   pp        g    g                  G ',
          'XXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'XXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
      },
      {
        name: '1-2 Cavernes', theme: 'underground', time: 300,
        map: [
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
          'H                                                                                     H',
          'H   o o      B?B          o o o            BBBB          k                             H',
          'H            BBB                                                       o o             H',
          'H                     ===           f           ===          === ?                    H',
          'H    g          o o          ^^^          k            g                      P        H',
          'H        ===   XXXX    g           XX          ===          XXX      g        p   o o  H',
          'HS    XX                    XXX        XXXXX            ===      ^^^           p      G H',
          'HXXXXXXX   XXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXX  XXXXXXXXXX  XXXXXXXXXXXXXH',
          'HXXXXXXX   XXXXXXXXXXX  XXXXXXXXXXXXXXXXXXXXXXXX  XXXXXXXXXXXX  XXXXXXXXXX  XXXXXXXXXXXXXH',
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
        ],
      },
    ],
  },
  {
    name: 'Forteresse',
    levels: [
      {
        name: '2-1 Remparts', theme: 'overworld', time: 320,
        map: [
          '                                                                                                 ',
          '                                                                                                 ',
          '              o o o o                          MBM                       o o o o                 ',
          '          ?                  BB?BB                          f f                                  ',
          '                    f                    o o                          ===        U              ',
          '       ===       o o     ===        ===           ^^^^         ===            o o      ===       ',
          '                              k             g            k                g              g       ',
          '   S      g            g            ^^^            XXX           g    ^^^^         g            G ',
          '  XXXXXXX     XXXXXX  XXXXXXX   XXXXXXXXXXX     XXXXXXXXX   XXXXXXX  XXXXXXXXXX  XXXXXXX  XXXXXXXXX',
          '  XXXXXXX     XXXXXX  XXXXXXX   XXXXXXXXXXX     XXXXXXXXX   XXXXXXX  XXXXXXXXXX  XXXXXXX  XXXXXXXXX',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
      },
      {
        name: '2-2 Château', theme: 'castle', time: 320,
        map: [
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
          'H                                                                                          H',
          'H      o o       BMB             k k            ===           B?B           o o o           H',
          'H   ?         ===          ^^^          ===            f            ===              ?      H',
          'H        f             o o       k            ^^^^           k k          f         o o     H',
          'H   ===        ^^^           ===        XXXX          ===          ^^^^        ===          H',
          'HS        k          ^^^^          k           g            ^^^           k            k  G H',
          'HXXXX   XXXXX   XXXXXX    XXXX   XXXXXXX   XXXX     XXXXXX  XXXX    XXXXXX   XXXX   XXXXXXXXXXH',
          'HXXXX   XXXXX   XXXXXX    XXXX   XXXXXXX   XXXX     XXXXXX  XXXX    XXXXXX   XXXX   XXXXXXXXXXH',
          'HXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXH',
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
        ],
      },
    ],
  },
];

// Arènes versus (symétriques, bouclées par les bords)
export const ARENAS = [
  {
    name: 'Arène Duo', theme: 'overworld', time: 99,
    map: [
      '                                        ',
      '                                        ',
      '       ?              MM             ?   ',
      '                                        ',
      '    ====        ========        ====    ',
      '                                        ',
      '         o o                 o o        ',
      '   1                                2   ',
      '======        ==========        ========',
      '                                        ',
      '         ====            ====           ',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
  },
  {
    name: 'Tours', theme: 'castle', time: 99,
    map: [
      '                                        ',
      '   ==                            ==     ',
      '   ==        MM      MM           ==     ',
      '   ==                             ==     ',
      '        ====            ====             ',
      '   1                                2    ',
      '  =====                        =======   ',
      '              ==========                 ',
      '       o o                    o o        ',
      '   =======                    =======    ',
      '                                         ',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
  },
];
