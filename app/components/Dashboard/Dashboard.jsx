import React from "react";
import Immutable from "immutable";
import DashboardList from "./DashboardList";
import { RecentTransactions } from "../Account/RecentTransactions";
import Translate from "react-translate-component";
import MarketCard from "./MarketCard";
import utils from "common/utils";
import { Apis } from "bitsharesjs-ws";
import LoadingIndicator from "../LoadingIndicator";
import LoginSelector from "../LoginSelector";
import cnames from "classnames";
import SettingsActions from "actions/SettingsActions";
import {sanitizeNewsContent} from "utils/sanitizeHtml";
import {isValidMarketDescriptor} from "utils/validate";
import logger from "utils/logger";

class Dashboard extends React.Component {

    constructor(props) {
        super();




        let marketsByChain = {
            "4018d784":[
                ["BRIDGE.BTC", "BRIDGE.BCO"],
                ["BRIDGE.BTC", "BRIDGE.BCH"],
                ["BRIDGE.BCH", "BRIDGE.BCO"],
                ["BTS", "BRIDGE.BCO"],

            ],
            "39f5e2ed": [
                ["TEST", "PEG.FAKEUSD"],
                ["TEST", "BTWTY"]
            ]
        };
        let chainID = Apis.instance().chain_id;
        if (chainID) chainID = chainID.substr(0, 8);

        this.state = {
            width: null,
            showIgnored: false,
            news: null,
            featuredMarkets: marketsByChain[chainID] || marketsByChain["4018d784"],
            newAssets: [

            ],
            currentEntry: props.currentEntry
        };

        this._setDimensions = this._setDimensions.bind(this);
        // this._sortMarketsByVolume = this._sortMarketsByVolume.bind(this);
    }

    componentDidMount() {
        this._setDimensions();

        window.addEventListener("resize", this._setDimensions, {capture: false, passive: true});

        const log = logger.child("Dashboard");
        const url = 'https://api.crypto-bridge.org/api/v1/markets';

        fetch(url).then(reply => reply.json().then(result => {
            // The feed is remote, unauthenticated input. Validate every entry
            // before it reaches a React key or a MarketCard prop.
            let markets = [];
            (Array.isArray(result) ? result : []).forEach((m) => {
                if (!isValidMarketDescriptor(m)) {
                    log.warn("discarding malformed market descriptor", {market: m});
                    return;
                }
                if (m.blacklisted === true) return;
                if (["BRIDGE.BTC", "BRIDGE.ZNY", "BRIDGE.MONA", "BRIDGE.DOGE"].indexOf(m.base) === -1) return;
                markets.push([m.base, m.quote, m.img]);
            });
            this.setState({featuredMarkets: markets});
        })).catch(err => {
            log.error("unable to load the featured markets feed", {error: err});
        });

        const newsUrl = 'https://crypto-bridge.org/news.json';

        fetch(newsUrl).then(reply => reply.json().then(news => {
            // `news.content` is remote HTML that is rendered with
            // dangerouslySetInnerHTML. Passing it through the allowlist
            // sanitizer is what stops the news host from executing script in
            // the wallet origin (see app/utils/sanitizeHtml.js).
            const safe = sanitizeNewsContent(news && news.content);
            this.setState({news: safe});
        })).catch(err => {
            log.error("unable to load the news feed", {error: err});
        });

    }

    shouldComponentUpdate(nextProps, nextState) {
        return (
            !utils.are_equal_shallow(nextState.featuredMarkets, this.state.featuredMarkets) ||
            !utils.are_equal_shallow(nextProps.lowVolumeMarkets, this.props.lowVolumeMarkets) ||
            !utils.are_equal_shallow(nextState.newAssets, this.state.newAssets) ||
            nextProps.linkedAccounts !== this.props.linkedAccounts ||
            // nextProps.marketStats !== this.props.marketStats ||
            nextProps.ignoredAccounts !== this.props.ignoredAccounts ||
            nextProps.passwordAccount !== this.props.passwordAccount ||
            nextState.width !== this.state.width ||
            nextProps.accountsReady !== this.props.accountsReady ||
            nextState.showIgnored !== this.state.showIgnored ||
            nextState.currentEntry !== this.state.currentEntry
        );
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this._setDimensions);
    }

    _setDimensions() {
        let width = window.innerWidth;

        if (width !== this.state.width) {
            this.setState({width});
        }
    }

    _onToggleIgnored() {
        this.setState({
            showIgnored: !this.state.showIgnored
        });
    }

    _onSwitchType(type) {
        this.setState({
            currentEntry: type
        });
        SettingsActions.changeViewSetting({
            dashboardEntry: type
        });
    }

    render() {
        let { linkedAccounts, myIgnoredAccounts, accountsReady, passwordAccount } = this.props;
        let {width, showIgnored, featuredMarkets, newAssets, currentEntry, news} = this.state;

        if (passwordAccount && !linkedAccounts.has(passwordAccount)) {
            linkedAccounts = linkedAccounts.add(passwordAccount);
        }
        let names = linkedAccounts.toArray().sort();
        if (passwordAccount && names.indexOf(passwordAccount) === -1) names.push(passwordAccount);
        let ignored = myIgnoredAccounts.toArray().sort();

        let accountCount = linkedAccounts.size + myIgnoredAccounts.size + (passwordAccount ? 1 : 0);

        if (!accountsReady) {
            return <LoadingIndicator />;
        }

        let validMarkets = 0;

        let markets = featuredMarkets
        .map(pair => {
            //let isLowVolume = this.props.lowVolumeMarkets.get(pair[1] + "_" + pair[0]) || this.props.lowVolumeMarkets.get(pair[0] + "_" + pair[1]);
            //if (!isLowVolume) validMarkets++;
            let isLowVolume = false;
            let className = "";
            if (validMarkets > 9) {
                className += ` show-for-${!accountCount ? "xlarge" : "large"}`;
            } else if (validMarkets > 6) {
                className += ` show-for-${!accountCount ? "large" : "medium"}`;
            }

            return (
                <MarketCard
                    key={pair[0] + "_" + pair[1]}
                    marketId={pair[1] + "_" + pair[0]}
                    new={newAssets.indexOf(pair[1]) !== -1}
                    className={className}
                    quote={pair[0]}
                    base={pair[1]}
                    invert={pair[2]}
                    isLowVolume={isLowVolume}
                    hide={validMarkets > 20}
                    img={pair[2]}
                />
            );
        }).filter(a => !!a);

        if (!accountCount) {
            return <LoginSelector />;
        }

        const entries = ["accounts", "recent"];
        const activeIndex = entries.indexOf(currentEntry);

        return (
            <div ref="wrapper" className="grid-block page-layout vertical">
                <div ref="container" className="grid-container" style={{padding: "10px 10px 0 10px"}}>
                    <div className="block-content-header" style={{marginBottom: 5}}>
                        <Translate content="exchange.news"/>
                    </div>
                    <div className="grid-block small-up-1 medium-up-3 large-up-4 no-overflow">
                        {news ? <p dangerouslySetInnerHTML={{ __html: news }}/> : null}
                    </div>


                    <div className="block-content-header" style={{marginBottom: 5}}>
                        <Translate content="exchange.featured"/>
                    </div>
                    <div className="grid-block small-up-1 medium-up-3 large-up-4 no-overflow fm-outer-container">
                        {markets}
                    </div>

                    {accountCount ? (
                        <div style={{paddingBottom: "3rem"}}>
                            <div className="hide-selector" style={{paddingBottom: "1rem"}}>
                                {entries.map((type, index) => {
                                    return (
                                        <div key={type} className={cnames("inline-block", {inactive: activeIndex !== index})} onClick={this._onSwitchType.bind(this, type)}>
                                            <Translate content={`account.${type}`} />
                                        </div>
                                    );
                                })}
                            </div>

                            {currentEntry === "accounts" ? <div className="generic-bordered-box" style={{marginBottom: 5}}>
                                <div className="box-content">
                                    <DashboardList
                                        accounts={Immutable.List(names)}
                                        ignoredAccounts={Immutable.List(ignored)}
                                        width={width}
                                        onToggleIgnored={this._onToggleIgnored.bind(this)}
                                        showIgnored={showIgnored}
                                    />
                                    {/* {showIgnored ? <DashboardList accounts={Immutable.List(ignored)} width={width} /> : null} */}
                                </div>
                            </div> : null}

                            {currentEntry === "recent" ? <RecentTransactions
                                style={{marginBottom: 20, marginTop: 20}}
                                accountsList={linkedAccounts}
                                limit={10}
                                compactView={false}
                                fullHeight={true}
                                showFilters={true}
                                dashboard
                            /> : null}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }
}

export default Dashboard;
