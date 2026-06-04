// levels.js — mondes & niveaux (level design original).
// Les niveaux des mondes 1 et 2 sont construits par js/levelbuild.js avec une
// géométrie GARANTIE franchissable (validée par test/solve.mjs).
// Légende des tuiles:
//  ' ' vide | X sol | H bloc dur | B brique | ? bloc(pièce) | M bloc(power-up) | U bloc(étoile) | L bloc(1UP)
//  p corps de tuyau | P tête de tuyau | ^ pics | = plateforme | o pièce | G arrivée
//  T ressort | C checkpoint | j gemme cachée | m plateforme mobile (horiz.) | n plateforme mobile (vert.)
//  S départ joueur | g marcheur | k ennemi à carapace | f volant | z ennemi à pics | O boss
import { BUILT } from './levelbuild.js';

export const WORLDS = [
  {
    name: 'Plaines de Bolt',
    levels: [BUILT.L11, BUILT.L12, BUILT.L13],
  },
  {
    name: 'Forteresse',
    levels: [BUILT.L21, BUILT.L22, BUILT.L23],
  },
  {
    name: 'Cimes & Gardien',
    levels: [
      {
        name: '3-1 Cimes venteuses', theme: 'overworld', time: 340,
        map: [
          '                                                                             ',
          '           j                       j                        j                 ',
          '        =====                   =======                  ======               ',
          '                                                                             ',
          '              U                                                              ',
          '   ?                  o o          ?                 o o          ?           ',
          '                ====                    ====                ===              ',
          '                                                                             ',
          '              m            C          n                                      ',
          '  S   g     z   T  g         z      g   T   z    g       g      g     G       ',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
      },
      {
        name: '3-2 Pont des cieux', theme: 'overworld', time: 340,
        map: [
          '                                                                            ',
          '       j                  o o o                  j                            ',
          '    ======                              ======                               ',
          '                  M              U                          ?                ',
          '           ===          ===           ===          ===                       ',
          '   ?                              o o                               ?         ',
          '              n            m            n             m                      ',
          '                                                                            ',
          '              C                                       C                      ',
          '  S   g  T  z      g       z      g    z  T  z    g       g      g     G       ',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
      },
      {
        name: "3-3 Antre du Gardien", theme: 'castle', time: 200,
        map: [
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
          'H                                          H',
          'H    M                                M     H',
          'H                                          H',
          'H        ===                  ===          H',
          'H                                          H',
          'H            j                    j        H',
          'H   ===                            ===     H',
          'H                                          H',
          'H S            o o      O      o o         H',
          'HXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXH',
          'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
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
  {
    name: 'Ressorts', theme: 'overworld', time: 99,
    map: [
      '                                        ',
      '                                        ',
      '      MM                       MM        ',
      '   ====                           ====   ',
      '                                        ',
      '   1          ========          2        ',
      '  ===                            ===     ',
      '            T            T               ',
      '       ====                ====          ',
      '                                        ',
      '   o o      ====    ====     o o         ',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
  },
];
