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
    levels: [BUILT.L31, BUILT.L32, BUILT.L33],
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
