// Contenu pédagogique de la co-construction (repris de la v2).
// Tout le texte est ici : on peut le modifier sans toucher à la logique.
// Les lignes marquées « À VÉRIFIER » contiennent un chiffre à sourcer ou probablement obsolète.

// Les clés (velo, tc, covoiturage, electrique) sont enregistrées dans Firestore : ne pas les renommer.
export const THEMES = {
  proche: [
    { key: 'velo', nom: 'Mobilité active', couleur: '#8CC63F', ressource: 'https://bourgineo-stack.github.io/infos-mobilite-active/' },
    { key: 'tc', nom: 'Transports en commun', couleur: '#8E6FD8', ressource: 'https://bourgineo-stack.github.io/infos_TC/' }
  ],
  eloigne: [
    { key: 'covoiturage', nom: 'Covoiturage', couleur: '#F7931E', ressource: 'https://bourgineo-stack.github.io/infos_covoiturage/' },
    { key: 'electrique', nom: 'Électrique et autopartage', couleur: '#2BA8E0', ressource: 'https://bourgineo-stack.github.io/cout-voiture/' }
  ]
};

export const RESSOURCES_COMMUNES = [
  { nom: 'Coût réel de la voiture', url: 'https://bourgineo-stack.github.io/cout-voiture/' },
  { nom: 'CO2 et euros', url: 'https://bourgineo-stack.github.io/CO2-et-euros/' },
  { nom: 'Télétravail', url: 'https://bourgineo-stack.github.io/infos-teletravail/' }
];

export const PHASES = [
  { key: 'revelation', nom: 'Intérêts', part: 0.25 },
  { key: 'freins', nom: 'Freins', part: 0.25 },
  { key: 'action', nom: 'Action', part: 0.5 }
];

export const CONSIGNES_SCRIBE = {
  revelation: "Lisez la question à voix haute, laissez le groupe deviner, puis révélez la réponse. Enchaînez avec une ou deux questions ci-dessous : choisissez, ne lisez pas tout.",
  freins: "Chacun dispose de 3 voix à répartir sur les freins qui le concernent (2 voix sur le même, c'est permis). Faites un tour de table et comptez avec les boutons. Discutez ensuite des 2 freins en tête.",
  action: "Lisez chaque engagement et demandez « qui est prêt ? ». Comptez les mains levées. Pas de pression : un seul volontaire suffit à lancer la dynamique."
};

export const CONTENU = {
  velo: {
    revelation: {
      question: "30 minutes d'activité physique par jour, combien d'années d'espérance de vie en plus ?",
      reponse: "+2 ans d'espérance de vie, -25 % de risque de maladies cardiovasculaires", // À VÉRIFIER : source
      discussion: [
        'Qui habite à moins de 5 km ? À vélo, le trajet prend 15 à 20 minutes.',
        'En voiture, avec le stationnement et les bouchons, est-ce vraiment plus rapide ?',
        'Qui a déjà essayé le vélo pour venir, même une fois ?'
      ]
    },
    freins: {
      options: [
        'Arriver en sueur au travail', 'Météo (pluie, froid)', 'Sécurité (pas de piste cyclable)',
        'Pas de vélo ou vélo en mauvais état', 'Pas de stationnement vélo sécurisé',
        "Je ne connais pas l'itinéraire", "C'est trop loin"
      ],
      discussion: [
        'Le vélo électrique lève-t-il certains de ces freins ?',
        'Connaissez-vous le forfait mobilités durables (jusqu\'à 600 € par an exonérés dans le privé) ?',
        'Y a-t-il des douches au travail ?'
      ]
    },
    action: {
      engagements: ['Tester un trajet à deux cette semaine', 'Prêter son vélo pour un essai', "Demander un local vélo sécurisé à l'entreprise"],
      astuces: [
        'Des manchons de guidon protègent mieux du froid que des gants.',
        'Des sacoches plutôt qu\'un sac à dos : dos au sec, moins de sueur.',
        'Testez le trajet un samedi matin, sans pression.'
      ]
    }
  },
  tc: {
    revelation: {
      question: "Quelle part de l'abonnement de transport en commun l'employeur doit-il obligatoirement rembourser ?",
      reponse: "50 % : c'est une obligation légale.",
      discussion: [
        'Qui connaissait cette obligation ?',
        'Avec 50 % remboursés, combien vous coûte votre abonnement annuel ?',
        'Comparez au coût réel de la voiture : environ 3 400 € par an pour 30 km (fiche « Coût réel de la voiture »).'
      ]
    },
    freins: {
      options: [
        "C'est plus long qu'en voiture", 'Pas de ligne directe', 'Horaires incompatibles avec les miens',
        'Bondé aux heures de pointe', 'Arrêt trop loin de chez moi ou du bureau', "Je ne connais pas les lignes ou l'appli"
      ],
      discussion: [
        'Avez-vous compté le stationnement, le stress et les bouchons dans la comparaison ?',
        'Des horaires décalés seraient-ils possibles ?',
        'Comment régler la question du dernier kilomètre ?'
      ]
    },
    action: {
      engagements: ["Télécharger l'appli de transport cette semaine", 'Tester un jour sans contrainte horaire', 'Accompagner un collègue qui veut essayer'],
      astuces: [
        'Une trottinette pliable règle souvent le premier ou le dernier kilomètre.',
        'Parking relais : on se gare gratuitement, puis tram ou bus.',
        "Testez un jour sans réunion tôt le matin."
      ]
    }
  },
  covoiturage: {
    revelation: {
      question: "Un trajet de 30 km (aller) en voiture seul, combien par an ?",
      reponse: 'Environ 3 400 € par an : 15,60 € par jour sur 220 jours, carburant, usure, assurance et entretien',
      discussion: [
        'À deux, en alternance, cela fait 1 700 € d\'économie chacun. Vous en feriez quoi ?',
        'Qui savait que le forfait mobilités durables couvre aussi le covoiturage ?',
        'Combien de places vides dans vos voitures ce matin ?'
      ]
    },
    freins: {
      options: [
        'Retards possibles (conducteur ou passager)', 'Itinéraire inconnu', 'Réunions imprévues, horaires variables',
        'Point de rendez-vous à définir', 'Partage des frais pas clair', 'Si mon covoitureur est malade, quel plan B ?', 'Pas de groupe pour communiquer'
      ],
      discussion: ['Ce frein est-il vraiment insurmontable ?', 'Qui dans le groupe aurait une solution ?', "L'entreprise pourrait-elle aider ?"],
      valeurs: {
        intro: 'Pour covoiturer sereinement, vos 3 valeurs prioritaires ?',
        options: ['Ponctualité', 'Flexibilité', 'Bonne humeur', 'Silence respecté', 'Économies claires', 'Loyauté (arrangements)']
      }
    },
    action: {
      engagements: ['Tester un trajet en covoiturage cette semaine', 'Rejoindre un groupe de messagerie covoiturage', "Identifier ma ligne de covoiturage et en parler"],
      astuces: [
        'Une ligne de covoiturage (même trajet, plusieurs personnes) multiplie les chances.',
        'Un groupe de messagerie permet de gérer les imprévus en direct.',
        "Trottinette pliable pour le dernier kilomètre si le rendez-vous n'est pas chez vous."
      ]
    }
  },
  electrique: {
    revelation: {
      question: 'Électrique ou thermique : quelle différence de CO2 par kilomètre ?',
      reponse: '190 g en thermique contre 20 g en électrique, soit -90 %', // À VÉRIFIER : à aligner sur le facteur retenu au lot 5
      discussion: [
        'Et en coût ? Environ 170 € de carburant par mois contre 40 € d\'électricité, pour 30 km de trajet.',
        "Qui fait moins de 50 km par jour ? L'autonomie suffit largement.",
        'Qui a déjà été passager dans une électrique ?'
      ]
    },
    freins: {
      options: [
        "Prix d'achat trop élevé", 'Autonomie insuffisante', 'Pas de borne chez moi', 'Pas de borne au travail',
        'Temps de recharge trop long', 'Je ne connais pas la conduite électrique'
      ],
      discussion: [
        'Connaissez-vous vos kilomètres réels par jour ?',
        "L'autopartage permet de tester sans acheter.",
        'Des aides à l\'achat existent (dispositifs nationaux, aides locales) : leurs montants changent souvent, vérifiez ceux du moment.' // À VÉRIFIER avant chaque atelier
      ]
    },
    action: {
      engagements: ['Tester une électrique en autopartage ce mois-ci', "Demander un essai à quelqu'un qui en a une", "Demander l'installation de bornes au travail"],
      astuces: [
        "Les services d'autopartage permettent de louer une électrique à la journée.",
        "Faites un essai en covoiturant avec quelqu'un qui roule en électrique.",
        'Calculez votre coût réel actuel : souvent 400 à 450 € par mois tout compris (fiche « Coût réel de la voiture »).'
      ]
    }
  }
};
