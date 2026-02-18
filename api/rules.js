const ALL_POSSIBLE_RULES = {

    // =============================================
    //               ALL INSTANTS
    // =============================================


    going_woke: {
        title: "Going Woke",
        description: "All Pieces in the right half of the board get pushed to the left 1 square (if open)",
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
        description: "One random non-King Piece is killed",
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
        description: "Each player chooses one opponent Piece and converts it to their team",
        isInstant: true,
    },
    drafted_for_battle: {
        title: "Drafted for Battle",
        description: "Both Players swap their King with a friendly Bishop or Knight of their choice",
        isInstant: true,
    },
    hot_drop: {
        title: "Hot Drop",
        description: "Each Player gets a Queen in a random open square (they cannot attack King this turn)",
        isInstant: true,
    },
    minefield: {
        title: "Minefield",
        description: "Mark 2 random empty squares. If a Piece enters that square, they die and the mine is removed",
        isInstant: true,
    },
    risk_it_rook: {
        title: "Risk it Rook",
        description: "50% chance for a free Rook in a random empty square. Your opponent gets 25% chance for the same thing.",
        isInstant: true,
    },
    kids_in_trenchcoat: {
        title: "2 Kids in a Trenchcoat",
        description: "Sacrifice 2 Pawns to put a new Bishop anywhere on the board",
        isInstant: true,
    },
    charge: {
        title: "CHAAAARGE!",
        description: "All your Pieces move one square towards the enemy (if open)",
        isInstant: true,
    },
    enemy_is_routed: {
        title: "The Enemy is Routed",
        description: "All enemy Pieces move one square backwards (if open)",
        isInstant: true,
    },
    nuclear_fallout: {
        title: "Nuclear Fallout",
        description: "2 random empty squares cannot be entered or crossed for the rest of the game",
        isInstant: true,
    },
    get_up_in_their_face: {
        title: "Get Up In Their Face",
        description: "All your Pieces slide forward until they hit an empty square",
        isInstant: true,
    },
    a_light_breeze: {
        title: "A Light Breeze",
        description: "All Pieces in rows 4 and 5 move one square to the right, killing anything in the way",
        isInstant: true,
    },
    anti_camping: {
        title: "Anti-Camping",
        description: "Pick an enemy Piece, swap it with a random friendly Piece",
        isInstant: true,
    },
    bottomless_pit: {
        title: "Bottomless Pit",
        description: "Pick an empty square. For the rest of the game, any Piece who enters it dies",
        isInstant: true,
    },
    moving_up_corporate_ladder: {
        title: "Moving Up the Corporate Ladder",
        description: "Pick 2 Pieces in the same column, then swap them",
        isInstant: true,
    },
    hurricane: {
        title: "Hurricane",
        description: "Pick 1 row, all Pieces in it are pushed to the left-most empty square (starting with left-most piece)",
        isInstant: true,
    },
    sophies_choice: {
        title: "Sophie's Choice",
        description: "Each player selects 2 random friendly Pieces, then picks one to kill",
        isInstant: true,
    },
    sunday_school: {
        title: "Sunday School",
        description: "Do random Sporcle quiz on religion, whoever's better gets a Bishop in chosen empty square",
        isInstant: true,
    },
    horse_race: {
        title: "Horse 1 Always Wins",
        description: "Watch a horse race, whoever's horse places higher gets a Knight in a chosen empty square",
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
    
    living_bomb: {
        title: "Living Bomb",
        description: "Pick a friendly Piece. If it's alive when this rule expires, it explodes and kills all adjacent pieces",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    mitosis: {
        title: "Mitosis",
        description: "Pick a Piece. It cannot move, but if it's alive when this rule expires, spawn a duplicate of the Piece into an empty adjacent square",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    treasure_chest: {
        title: "Treasure Chest",
        description: "Select a random empty square. The first Piece to enter that square is promoted",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    mr_freeze: {
        title: "Mr Freeze",
        description: "Pick 1 column. All Pieces in it are frozen and immune until this expires.",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    portal_3: {
        title: "Portal 3",
        description: "Pick 2 squares. At the end of every turn, those two squares swap",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    no_mans_land: {
        title: "No Mans Land",
        description: "Pick 1 column. No Pieces may enter or cross the column. (Pieces currently in the column can leave it)",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    cash_grab: {
        title: "Cash Grab",
        description: "Any Piece that reaches the back line can promote",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    summoning_ritual: {
        title: "Summoning Ritual",
        description: "When this expires, whichever Player has more Pieces on the 4 corner spots gets a Rook at a chosen empty square",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    call_down_lightning: {
        title: "Call Down Lightning",
        description: "Mark a random empty square. When this expires, whoever controls that square chooses an enemy piece to die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    get_the_fuck_off: {
        title: "Get The Fuck Off",
        description: "Pick 2 squares on the board. When this expires, any Pieces on those squares die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    gigachad_aura: {
        title: "Gigachad Aura",
        description: "When this expires, all Pieces adjacent to a King die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    second_chance: {
        title: "Second Chance",
        description: "When any Piece dies, 50% chance it is revived in a random empty square",
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
    severe_constipation: {
        title: "Severe Constipation",
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
        maxTurns: 6,
    },
    christmas_truce: {
        title: "Christmas Truce",
        description: "No Pieces can die",
        isInstant: false,
        minTurns: 3,
        maxTurns: 5,
    },
    ice_age: {
        title: "Ice Age",
        description: "Pieces in columns 1 and 8 are frozen",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    portal_storm: {
        title: "Portal Storm",
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
        maxTurns: 7,
    },
    down_with_the_ship: {
        title: "Down with the Ship",
        description: "Any capture also kills the capturing Piece",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    god_kings: {
        title: "God Kings",
        description: "Kings are immune and can move 2 squares at a time",
        isInstant: false,
        minTurns: 3,
        maxTurns: 7,
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
        description: "Pieces may move a maximum of 1 square per turn.",
        isInstant: false,
        minTurns: 3,
        maxTurns: 7,
    },
    pawns_with_viagra: {
        title: "Pawns with Viagra",
        description: "Pawns can attack left and right",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    trans_rights: {
        title: "Trains Rights",
        description: "Kings move like Queens, Queens move like Kings",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    kamikaze: {
        title: "Kamikaze",
        description: "When a Piece dies, 25% chance that ALL adjacent Pieces die",
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
        description: "Pawns can push Pieces forward (into empty squares). Works with multiple stacked Pieces.",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    all_on_red: {
        title: "All on Red",
        description: "Flip a coin at start of your turn, if it's tails you can only move your King.",
        isInstant: false,
        minTurns: 3,
        maxTurns: 9,
    },
    estrogen: {
        title: "Estrogen",
        description: "Your King can move like a Queen",
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
        description: "Pick an empty square. If any Piece *can* move to that square, it must",
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
        isInstant: false,
        minTurns: 3,
        maxTurns: 6,
    },
};

function getRawRules(count=25) {
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
export function getNextRules(currentRules) {
    
    console.log("Generating 3 new rules...");
    // First grab a randomized list of 25 rules
    // We need more than 3 in case any of them are already active
    // Definitely a better way of doing this but fuck it I am exhausted
    const rawRules = getRawRules(25);
    let newRules = [];
    for (const nextRule of rawRules) {
        // First, check if this rule is already active - if so, we skip it
        if (currentRules.some(currentRule => nextRule.title === currentRule.title)) {
            continue;
        }
        // Now add the rule
        if (nextRule.isInstant) {
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: true,
                turnsLeft: 0, // unnecessary but just keeping for data consistency
            });
        } else {
            // Calculate the # of turns this rule will actually last for 
            const randomTurns = Math.floor(Math.random() * (nextRule.maxTurns - nextRule.minTurns + 1)) + nextRule.minTurns;
            newRules.push({
                title: nextRule.title,
                description: nextRule.description,
                isInstant: false,
                turnsLeft: randomTurns,
            });
        }
        // Stop once we've reached the 3-rule cap
        if (newRules.length >= 3) {
            break;
        }
    }
    // Now return our list of new rules!
    return newRules;
}

