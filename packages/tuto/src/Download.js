import React from 'react';

class Download extends React.Component {
    constructor(props) {
        super(props);

        this.state = {downloadDone: false}
    }

    async componentDidMount() {
        await this.props.fileKit.download(this.props.fileId);
        this.setState({downloadDone: true})
    }

    render() {
        if (!this.state.downloadDone)
            return (<div>Downloading...</div>);
        return (
            <div style={{display: "flex", flexFlow: "column", alignItems:"flex-start"}}>
                Downloading done!
                <button onClick={this.props.doneCb}>Exit</button>
            </div>
        );
    }

}

export default Download;
