/*  Tower of Hanoi - pure SWI-Prolog backend
    Run with:   swipl hanoi.pl
    Then open:  http://localhost:8080
*/

:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_json)).
:- use_module(library(lists)).
:- use_module(library(apply)).

% ---------------------------------------------------------------
% Remember the directory this file lives in, so files are found
% no matter where swipl was started from.
% ---------------------------------------------------------------
:- dynamic base_dir/1.
:- prolog_load_context(directory, Dir), assertz(base_dir(Dir)).

% ---------------------------------------------------------------
% Explicit routing (no prefix routing)
% ---------------------------------------------------------------
:- http_handler(root(.),              serve_index, []).
:- http_handler(root('css/style.css'), serve_css,   []).
:- http_handler(root('js/game.js'),    serve_js,    []).
:- http_handler(root('api/move'),      handle_move,  [method(post)]).
:- http_handler(root('api/solve'),     handle_solve, [method(post)]).

serve_index(Request) :- serve_file('index.html',     'text/html',                Request).
serve_css(Request)   :- serve_file('css/style.css',  'text/css',                 Request).
serve_js(Request)    :- serve_file('js/game.js',     'application/javascript',   Request).

serve_file(Relative, Mime, Request) :-
    base_dir(Dir),
    atomic_list_concat([Dir, '/', Relative], Path),
    http_reply_file(Path, [mime_type(Mime), cache(false)], Request).

% ---------------------------------------------------------------
% POST /api/move   {state: [[..],[..],[..]], from: Int, to: Int}
% ---------------------------------------------------------------
handle_move(Request) :-
    catch(read_move(Request, State, From, To), _, fail),
    !,
    (   valid_move(State, From, To, NewState)
    ->  reply_json_dict(_{valid: true, newState: NewState})
    ;   reply_json_dict(_{valid: false})
    ).
handle_move(_) :-
    reply_json_dict(_{valid: false, error: "bad request"}).

read_move(Request, State, From, To) :-
    http_read_json_dict(Request, Dict),
    get_dict(state, Dict, State),
    get_dict(from,  Dict, From),
    get_dict(to,    Dict, To),
    is_list(State),
    integer(From),
    integer(To).

% ---------------------------------------------------------------
% POST /api/solve  {disks: Int, pegs: Int}
% ---------------------------------------------------------------
handle_solve(Request) :-
    catch(read_solve(Request, N, P), _, fail),
    N >= 1, N =< 10, P =:= 3,
    !,
    hanoi(N, 0, 2, 1, Moves0),
    maplist(move_dict, Moves0, Moves),
    reply_json_dict(_{moves: Moves}).
handle_solve(_) :-
    reply_json_dict(_{error: "disks must be 1..10 and pegs must be 3"},
                    [status(400)]).

read_solve(Request, N, P) :-
    http_read_json_dict(Request, Dict),
    get_dict(disks, Dict, N),
    get_dict(pegs,  Dict, P),
    integer(N),
    integer(P).

move_dict(move(F, T), _{from: F, to: T}).

% ---------------------------------------------------------------
% Pure game logic
%
% State: list of pegs. Each peg is a list ordered BOTTOM-to-TOP,
% e.g. [[3,2,1],[],[]]. Pegs are indexed from 0.
% ---------------------------------------------------------------

%! valid_move(+State, +From, +To, -NewState)
valid_move(State, From, To, NewState) :-
    maplist(is_list, State),
    length(State, NumPegs),
    between(0, NumPegs, From), From < NumPegs,
    between(0, NumPegs, To),   To   < NumPegs,
    From =\= To,
    nth0(From, State, SourcePeg),
    nth0(To,   State, TargetPeg),
    SourcePeg \== [],
    last(SourcePeg, TopDisk),                 % top disk = last element
    (   TargetPeg == []
    ->  true
    ;   last(TargetPeg, TargetTop),
        TopDisk < TargetTop                   % only smaller onto larger
    ),
    append(NewSource, [TopDisk], SourcePeg),  % remove top disk
    append(TargetPeg, [TopDisk], NewTarget),  % place on target
    replace_nth(From, State,  NewSource, State1),
    replace_nth(To,   State1, NewTarget, NewState).

replace_nth(Index, List, Elem, NewList) :-
    nth0(Index, List, _, Rest),
    nth0(Index, NewList, Elem, Rest).

%! hanoi(+N, +From, +To, +Via, -Moves)
hanoi(0, _, _, _, []) :- !.
hanoi(N, From, To, Via, Moves) :-
    N > 0,
    N1 is N - 1,
    hanoi(N1, From, Via, To, Moves1),
    hanoi(N1, Via, To, From, Moves2),
    append(Moves1, [move(From, To)|Moves2], Moves).

% ---------------------------------------------------------------
% Start the server and keep the process alive
% ---------------------------------------------------------------
run_server :-
    http_server(http_dispatch, [port(8080)]),
    format("Tower of Hanoi server running at http://localhost:8080~n"),
    format("Press Ctrl+C to stop.~n"),
    thread_get_message(_).

:- initialization(run_server).
