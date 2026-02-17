const ALL_POSSIBLE_RULES = {

    // =============================================
    //               ALL INSTANTS
    // =============================================

    going_woke: {
        title: "Going Woke",
        description: "All Pieces in the center 4 squares are pushed to the left (if open)",
        isInstant: true,
    },
    march_of_the_pawnguins: {
        title: "March of the Pawnguins",
        description: "All Pawns advance one square if it's empty (no captures)",
        isInstant: true,
    },
    the_rumbling: {
        title: "The Rumbling",
        description: "All Pawns advance one square and kill everything they touch",
        isInstant: true,
    },
    they_deserved_it: {
        title: "They Deserved It",
        description: "One random Piece is killed",
        isInstant: true,
    },
    blood_for_the_pawn_god: {
        title: "Blood for the Pawn God",
        description: "Three random Pawns are killed",
        isInstant: true,
    },
    born_again_christian: {
        title: "Born Again Christian",
        description: "All Queens becomes Bishops",
        isInstant: true,
    },
    dub_thee_knight: {
        title: "Dub Thee Knight",
        description: "Two random Pawns become Knights",
        isInstant: true,
    },
    shitty_crusade: {
        title: "Shitty Crusade",
        description: "One random Knight becomes a Bishop",
        isInstant: true,
    },
    back_that_shit_up: {
        title: "Back That Shit Up",
        description: "All Pawns move backward one square (if open)",
        isInstant: true,
    },
    column_swap: {
        title: "Column Swap",
        description: "All Pieces in two random columns are swapped",
        isInstant: true,
    },
    mind_control: {
        title: "Mind Control",
        description: "Each player chooses one opponent Piece to take control of",
        isInstant: true,
    },
    drafted_for_battle: {
        title: "Drafted for Battle",
        description: "Both Player's Kings swap places with a Bishop or Knight of their choice",
        isInstant: true,
    },
    hot_drop: {
        title: "Hot Drop",
        description: "Each Player gets a Queen in a random open square (can't attack King this turn)",
        isInstant: true,
    },
    minefield: {
        title: "Minefield",
        description: "3 random empty square becomes a mine, any piece that enters them dies",
        isInstant: true,
    },
    risk_it_rook: {
        title: "Risk it Rook",
        description: "25% chance to get a free Rook in a random empty square",
        isInstant: true,
    },
    kids_in_trenchcoat: {
        title: "2 Kids in a Trenchcoat",
        description: "Sacrifice 2 Pawns to put a new Bishop anywhere on the board",
        isInstant: true,
    },
    gravity_shift: {
        title: "Gravity Shift",
        description: "All your Pieces move one square towards the enemy (if open)",
        isInstant: true,
    },
    permanent_quarantine: {
        title: "Permanent Quarantine",
        description: "2 random empty squares cannot be entered or crossed for the rest of the game",
        isInstant: true,
    },
    
    // =============================================
    //               ALL TIMED
    // =============================================
  
    blood_sacrifice: {
        title: "Blood Sacrifice",
        description: "Players pick one of their own pieces to die after every turn",
        isInstant: false,
        minTurns: 3,
        maxTurns: 5,
    },
    
    second_chance: {
        title: "Second Chance",
        description: "Captured Pieces revive at their starting square (if open)",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    bloodthirsty: {
        title: "Bloodthirsty",
        description: "You must make a move that captures an enemy (if possible)",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    paralyzed_by_constipation: {
        title: "Paralyzed by Constipation",
        description: "Bishops and Knights cannot move",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    hobbit_battle: {
        title: "Hobbit Battle",
        description: "ONLY Pawns can be moved",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    hobbit_slaughter: {
        title: "Hobbit Slaughter",
        description: "Only Pawns can die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    christmas_truce: {
        title: "Christmas Truce",
        description: "No Pieces can die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    ice_age: {
        title: "Ice Age",
        description: "Pieces in columns 1 and 8 are frozen",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    holy_mandate: {
        title: "Holy Mandate",
        description: "Bishops cannot die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    off_limits: {
        title: "Off Limits",
        description: "3 random empty squares cannot be entered or crossed",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    portal_3: {
        title: "Portal 3",
        description: "Two random non-King Pieces swap places at the end of every turn",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    proletariat: {
        title: "Proletariat",
        description: "Every piece moves like a Pawn",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    down_with_the_ship: {
        title: "Down with the Ship",
        description: "Any capture also kills the capturing piece",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    god_kings: {
        title: "God Kings",
        description: "Kings are immune and can move 2 squares at a time",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    early_promo: {
        title: "Early Promotion",
        description: "Pawns promote on the 6th row instead of the 8th",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    short_stop: {
        title: "Short Stop",
        description: "Pieces may move a maximum of 2 squares per turn",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    pawns_with_viagra: {
        title: "Pawns with Viagra",
        description: "Pawns can attack left and right",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    trans_rights: {
        title: "Trans Rights",
        description: "Kings move like Queens, Queens move like Kings",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    kamikaze: {
        title: "Kamikaze",
        description: "When a Piece dies, 25% chance that ALL Pieces around it die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    parry: {
        title: "Parry",
        description: "Rock Paper Scissors for a chance to stop any attack",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    pawns_learned_strength: {
        title: "Pawns learned Strength!",
        description: "Pawns can push Pieces forward",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    all_on_red: {
        title: "All on Red",
        description: "Every move, flip a coin. If it's tails you lose your turn (unless you're in check)",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    estrogen: {
        title: "Estrogen",
        description: "Your King can now move like a Queen (Requires 1 Sacrifice)",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    ice_physics: {
        title: "Ice Physics",
        description: "Bishops, Rooks, and Queens MUST move the maximum distance",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    soul_link: {
        title: "Soul Link",
        description: "If a Knight dies, both your Knights die. Same for Rooks and Bishops",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    pacman_style: {
        title: "Pacman Style",
        description: "Pieces can wrap around the right and left sides of the board",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    no_cowards: {
        title: "No Cowards",
        description: "All moves must move closer to your opponent's side of the board",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    tornado: {
        title: "Tornado",
        description: "Pick a random square, if any Piece *can* move to that square, it must.",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    religious_conversion: {
        title: "Religious Conversion",
        description: "If a Bishop moves next to an enemy Pawn, you convert it to your team",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    time_bomb: {
        title: "Time Bomb",
        description: "All Pieces in Column E die when this rule expires",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    sunday_school: {
        title: "Sunday School",
        description: "Do a random Sporcle quiz on religion, whoever scores higher gets a free Bishop",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    horse_race: {
        title: "Horse 1 Always Wins",
        description: "Watch a horse race, whoever's horse places higher gets a Knight in a random empty square",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    knee_surgery: {
        title: "Knee Surgery",
        description: "Kings can now move 2 spots in every direction",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    crtical_strike: {
        title: "Critical Strike",
        description: "Every capture has a 50% chance to capture a random adjacent enemy Piece",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    terrible_idea: {
        title: "Terrible Idea",
        description: "Twitch Chat decides a new rule",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    invul_potion: {
        title: "Invulnerability Potion",
        description: "Two random Pieces on your team cannot die",
        isInstant: true,
        minTurns: 3,
        maxTurns: 8,
    },


};
    
    // pacifist: {
    //     title: "Pacifist",
    //     description: "No piece can take any other pieces",
    //     isInstant: false,
    //     minTurns: 5,
    //     maxTurns: 10,
    // },
    // switcheroo: {
    //     title: "Switcheroo",
    //     description: "All Bishops and Knights swap places",
    //     isInstant: true,
    // },
    // communism: {
    //     title: "Communism",
    //     description: "Every piece moves like a pawn",
    //     isInstant: false,
    //     minTurns: 5,
    //     maxTurns: 10,
    // },
    // ice_age: {
    //     title: "Ice Age",
    //     description: "Columns 1 and 8 are frozen",
    //     isInstant: false,
    //     minTurns: 5,
    //     maxTurns: 10,
    // },


function getRawRules(count) {
    return Object.entries(ALL_POSSIBLE_RULES)
      .map(([id, rule]) => ({ id, ...rule }))
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
}

/*
Returns an array of rule objects:
[
    { 
        title: "Pacifist",
        description: "No piece can take any other pieces",
        turnsLeft: 4,
        isInstant: false
    },
    { 
        title: "Switcheroo",
        description: "All Bishops and Knights swap places",
        isInstant: true,
        turnsLeft: 0
    },
    ....
]
*/
export function getNextRules(count = 3) {
    // First grab 3 random rules
    const rawRules = getRawRules(count);
    let newRules = [];
    // Now we calculate the # of turns this rule will actually last for 
    for (const nextRule of rawRules) {
        if (nextRule.isInstant) {
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: true,
                turnsLeft: 0, // unnecessary but just keeping for data consistency
            });
        } else {
            const randomTurns = Math.floor(Math.random() * (nextRule.maxTurns - nextRule.minTurns + 1)) + nextRule.minTurns;
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: false,
                turnsLeft: randomTurns,
            });
        }
    }
    // Now return our list of new rules!
    return newRules;
}

