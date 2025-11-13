const sunSalutations = [
    { name: "Surya Namaskar A", isTwoSided: false },
    { name: "Surya Namaskar B", isTwoSided: false },
];
const sharedStanding = [
    {
        name: "Padangusthasana",
        isTwoSided: false
    },
    {
        name: "Padahastasana",
        isTwoSided: false
    },
    {
        name: "Utthita Trikonasana",
        isTwoSided: true
    },
    {
        name: "Parivrtta Trikonasana",
        isTwoSided: true
    },
    {
        name: "Utthita Parsvakonasana",
        isTwoSided: true
    },
    {
        name: "Parivrtta Parsvakonasana",
        isTwoSided: true
    },
    {
        name: "Prasarita Padottanasana A",
        isTwoSided: false
    },
    {
        name: "Prasarita Padottanasana B",
        isTwoSided: false
    },
    {
        name: "Prasarita Padottanasana C",
        isTwoSided: false
    },
    {
        name: "Prasarita Padottanasana D",
        isTwoSided: false
    },
    {
        name: "Parsvottanasana",
        isTwoSided: true
    },
];
// const sharedFinishing = [
//     //Finishing Poses, common to all series
//     "Urdhva Dhanurasana",
//     "Paschimottanasana",
//     "Salamba Sarvangasana",
//     "Halasana",
//     "Karnapidasana",
//     "Urdva Padmasana",
//     "Pindasana",
//     "Matsyasana",
//     "Uttana Padasana",
//     "Sirsasana",
//     "Baddha Padmasana",
//     "Yoga Mudra Asana",
//     "Padmasana",
//     "Utpluthih",
//     "Savasana"
// ]
//Redo sharedFinishing to match the SequenceGroup Type
const sharedFinishing = [
    {
        name: "Urdhva Dhanurasana",
        isTwoSided: false
    },
    {
        name: "Paschimottanasana",
        isTwoSided: false
    },
    {
        name: "Salamba Sarvangasana",
        isTwoSided: false
    },
    {
        name: "Halasana",
        isTwoSided: false
    },
    {
        name: "Karnapidasana",
        isTwoSided: false
    },
    {
        name: "Urdva Padmasana",
        isTwoSided: false
    },
    {
        name: "Pindasana",
        isTwoSided: false
    },
    {
        name: "Matsyasana",
        isTwoSided: false
    },
    {
        name: "Uttana Padasana",
        isTwoSided: false
    },
    {
        name: "Sirsasana A",
        isTwoSided: false
    },
    {
        name: "Sirsasana B",
        isTwoSided: false
    },
    {
        name: "Sirsasana C",
        isTwoSided: false
    },
    {
        name: "Yoga Mudra Asana",
        isTwoSided: false
    },
    {
        name: "Padmasana",
        isTwoSided: false
    },
    {
        name: "Utpluthih",
        isTwoSided: false
    },
    {
        name: "Savasana",
        isTwoSided: false
    }
];
const primaryPoses = [
    //Primary Specific Poses begin here
    { name: "Utthita Hasta Padangusthasana", isTwoSided: true },
    { name: "Ardha Baddha Padmottanasana", isTwoSided: true },
    { name: "Uttkatasana", isTwoSided: false },
    { name: "Virabhadrasana I", isTwoSided: true },
    { name: "Virabhadrasana II", isTwoSided: true },
    { name: "Dandasana", isTwoSided: false },
    { name: "Paschimottanasana A", isTwoSided: false },
    { name: "Paschimottanasana B", isTwoSided: false },
    { name: "Paschimottanasana C", isTwoSided: false },
    { name: "Purvottanasana", isTwoSided: false },
    { name: "Ardha Baddha Padma Paschimottanasana", isTwoSided: true },
    { name: "Triang Mukha Eka Pada Paschimottanasana", isTwoSided: true },
    { name: "Janu Sirsasana A", isTwoSided: true },
    { name: "Janu Sirsasana B", isTwoSided: true },
    { name: "Janu Sirsasana C", isTwoSided: true },
    { name: "Marichyasana A", isTwoSided: true },
    { name: "Marichyasana B", isTwoSided: true },
    { name: "Marichyasana C", isTwoSided: true },
    { name: "Marichyasana D", isTwoSided: true },
    { name: "Navasana", isTwoSided: false },
    { name: "Bujapidasana", isTwoSided: false },
    { name: "Kurmasana", isTwoSided: false },
    { name: "Supta Kurmasana", isTwoSided: false },
    { name: "Garbha Pindasana", isTwoSided: false },
    { name: "Kukkutasana", isTwoSided: false },
    { name: "Baddha Konasana A", isTwoSided: false },
    { name: "Baddha Konasana B", isTwoSided: false },
    { name: "Baddha Konasana C", isTwoSided: false },
    { name: "Upavistha Konasana A", isTwoSided: false },
    { name: "Upavistha Konasana B", isTwoSided: false },
    { name: "Supta Konasana", isTwoSided: false },
    { name: "Supta Padangusthasana", isTwoSided: false },
    { name: "Ubhaya Padangusthasana", isTwoSided: false },
    { name: "Urdva Mukha Paschimottanasana", isTwoSided: false },
    { name: "Setu Bandhasana", isTwoSided: false },
];
const intermediatePoses = [
    //Intermediate Specific Poses begin here
    { name: "Pasasana", isTwoSided: false },
    { name: "Krounchasana", isTwoSided: false },
    { name: "Shalabhasana A", isTwoSided: false },
    { name: "Shalabhasana B", isTwoSided: false },
    { name: "Bhekasana", isTwoSided: false },
    { name: "Dhanurasana", isTwoSided: false },
    { name: "Parsva Dhanurasana", isTwoSided: true },
    { name: "Ustrasana", isTwoSided: false },
    { name: "Laghu Vajrasana", isTwoSided: false },
    { name: "Kapotasana A", isTwoSided: false },
    { name: "Kapotasana B", isTwoSided: false },
    { name: "Supta Vajrasana", isTwoSided: false },
    { name: "Bakasana A", isTwoSided: false },
    { name: "Bakasana B", isTwoSided: false },
    { name: "Bharadvajasana", isTwoSided: true },
    { name: "Ardha Matsyendrasana", isTwoSided: true },
    { name: "Eka Pada Sirsasana", isTwoSided: true },
    { name: "Dwi Pada Sirsasana", isTwoSided: false },
    { name: "Tittibhasana A", isTwoSided: false },
    { name: "Tittibhasana B", isTwoSided: false },
    { name: "Tittibhasana C", isTwoSided: false },
    { name: "Pincha Mayurasana", isTwoSided: false },
    { name: "Karandavasana", isTwoSided: false },
    { name: "Mayurasana", isTwoSided: false },
    { name: "Nakrasana", isTwoSided: false },
    { name: "Vatayanasana", isTwoSided: true },
    { name: "Parighasana", isTwoSided: true },
    { name: "Gomukhasana A", isTwoSided: true },
    { name: "Gomukhasana B", isTwoSided: true },
    { name: "Supta Urdhva Pada Vajrasana", isTwoSided: true },
    { name: "Muka Hasta Sirsasana A", isTwoSided: false },
    { name: "Muka Hasta Sirsasana B", isTwoSided: false },
    { name: "Muka Hasta Sirsasana C", isTwoSided: false },
    { name: "Baddha Hasta Sirsasana A", isTwoSided: false },
    { name: "Baddha Hasta Sirsasana B", isTwoSided: false },
    { name: "Baddha Hasta Sirsasana C", isTwoSided: false },
    { name: "Baddha Hasta Sirsasana D", isTwoSided: false },
];
const advancedAPoses = [
    //Advanced A Specific Poses begin here
    { name: "Vasisthasana", isTwoSided: false },
    { name: "Vishvamitrasana", isTwoSided: false },
    { name: "Kasyapasana", isTwoSided: false },
    { name: "Chakorasana", isTwoSided: false },
    { name: "Bhairvasana", isTwoSided: false },
    { name: "Skandasana", isTwoSided: false },
    { name: "Durvasasana", isTwoSided: false },
    { name: "Urdhva Kukkutasana A", isTwoSided: false },
    { name: "Urdhva Kukkutasana B", isTwoSided: false },
    { name: "Urdhva Kukkutasana C", isTwoSided: false },
    { name: "Galavasana", isTwoSided: false },
    { name: "Eka Pada Bakasana A", isTwoSided: false },
    { name: "Eka Pada Bakasana B", isTwoSided: false },
    { name: "Koundinyanasana A", isTwoSided: false },
    { name: "Koundinyanasana B", isTwoSided: false },
    { name: "Astavakrasana A", isTwoSided: false },
    { name: "Astavakrasana B", isTwoSided: false },
    { name: "Purna Matsyendrasana", isTwoSided: false },
    { name: "Viranchyasana A", isTwoSided: false },
    { name: "Viranchyasana B", isTwoSided: false },
    { name: "Viparita Dandasana", isTwoSided: false },
    { name: "Eka Pada Viparita Dandasana", isTwoSided: false },
    { name: "Viparita Salabhasana", isTwoSided: false },
    { name: "Ganda Bherundasana A", isTwoSided: false },
    { name: "Ganda Bherundasana B", isTwoSided: false },
    { name: "Hanumanasana A", isTwoSided: false },
    { name: "Hanumanasana B", isTwoSided: false },
    { name: "Supta Trivikramasana", isTwoSided: false },
    { name: "Dighasana A", isTwoSided: false },
    { name: "Dighasana B", isTwoSided: false },
    { name: "Trivikramasana", isTwoSided: false },
    { name: "Natarajasana", isTwoSided: false },
    { name: "Raja Kapotasana", isTwoSided: false },
    { name: "Eka Pada Raja kapotasana", isTwoSided: false },
];
const advancedBPoses = [
    //Advanced B Specific Poses begin here
    { name: "Mula Bandhasana", isTwoSided: false },
    { name: "Nahusasana A", isTwoSided: false },
    { name: "Nahusasana B", isTwoSided: false },
    { name: "Nahusasana C", isTwoSided: false },
    { name: "Vrschikasana", isTwoSided: false },
    { name: "Sayanasana", isTwoSided: false },
    { name: "Buddhasana", isTwoSided: false },
    { name: "Kapilasana", isTwoSided: false },
    { name: "Akarna Dhanurasana A", isTwoSided: false },
    { name: "Akarna Dhanurasana B", isTwoSided: false },
    { name: "Padangustha Dhanurasana A", isTwoSided: false },
    { name: "Padangustha Dhanurasana B", isTwoSided: false },
    { name: "Marichyasana E", isTwoSided: false },
    { name: "Marichyasana F", isTwoSided: false },
    { name: "Marichyasana G", isTwoSided: false },
    { name: "Marichyasana H", isTwoSided: false },
    { name: "Tadasana", isTwoSided: false },
    { name: "Samanasana", isTwoSided: false },
    { name: "Punga Kukkutasana", isTwoSided: false },
    { name: "Parsva Bakasana", isTwoSided: false },
    { name: "Eka Pada Dhanurasana A", isTwoSided: false },
    { name: "Eka Pada Dhanurasana B", isTwoSided: false },
    { name: "Eka Pada Kapotasana A", isTwoSided: false },
    { name: "Eka Pada Kapotasana B", isTwoSided: false },
    { name: "Paryangasana A", isTwoSided: false },
    { name: "Paryangasana B", isTwoSided: false },
    { name: "Parivrttasana A", isTwoSided: false },
    { name: "Parivrttasana B", isTwoSided: false },
    { name: "Yoni Dandasana A", isTwoSided: false },
    { name: "Yoni Dandasana B", isTwoSided: false },
    { name: "Yoga Dandasana", isTwoSided: false },
    { name: "Bhuja Dandasana", isTwoSided: false },
    { name: "Parsva Dandasana", isTwoSided: false },
    { name: "Adho Dandasana", isTwoSided: false },
    { name: "Urdhva Dandasana", isTwoSided: false },
    { name: "Sama Konasana", isTwoSided: false },
    { name: "Omkarasana", isTwoSided: false },
];
export const primarySeries = {
    name: "Ashtanga Primary Series",
    description: "The first series of Ashtanga Yoga, also known as Yoga Chikitsa (Yoga Therapy).",
    poses: [
        ...sharedStanding,
        ...primaryPoses,
        ...sharedFinishing
    ]
};
export const intermediateSeries = {
    name: "Ashtanga Intermediate Series",
    description: "The second series of Ashtanga Yoga, also known as Nadi Shodhana (Nerve Purification).",
    poses: [
        ...sharedStanding,
        ...intermediatePoses,
        ...sharedFinishing
    ]
};
export const advancedASeries = {
    name: "Ashtanga Advanced A Series",
    description: "The third series of Ashtanga Yoga, also known as Sthira Bhaga (Strength and Grace).",
    poses: [
        ...sharedStanding,
        ...advancedAPoses,
        ...sharedFinishing
    ]
};
export const advancedBSeries = {
    name: "Ashtanga Advanced B Series",
    description: "The fourth series of Ashtanga Yoga, also known as Sthira Bhaga (Strength and Grace).",
    poses: [
        ...sharedStanding,
        ...advancedBPoses,
        ...sharedFinishing
    ]
};
