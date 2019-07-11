import React from 'react';

class Upload extends React.Component {
    constructor(props) {
        super(props);
        this.state = {recipient: "", file: null}
    }

    updateFiles(event) {
        // only taking the first file for simplicity
        this.setState({file: event.target.files[0]});
    }

    updateRecipient(event) {
        this.setState({recipient: event.target.value})
    }

    onSend = async () => {
        const recipient = this.props.fakeAuth.getPublicIdentities([this.state.recipient]);
        const fileId = await this.props.fileKit.upload(this.state.file, { shareWithUsers: [Object.Values(recipient)] });

        const downloadLink = 'http://localhost:3000?fileId='+encodeURIComponent(fileId)+'&email='+encodeURIComponent(this.state.recipient);
        this.setState({downloadLink});
    }

    render() {
        return (
            <div style={{display: "flex", flexFlow: "column", alignItems:"flex-start"}}>
                <label>Recipient email</label>
                <input type="email" placeholder="Recipient email" value={this.state.recipient} onChange={e => this.updateRecipient(e)} name="recipient"/>
                <label>File to upload</label>
                <input type="file" onChange={e => this.updateFiles(e)} />
                {this.state.downloadLink?
                    <div>Done! Here is the download link: <a href={this.state.downloadLink}>{this.state.downloadLink}</a></div>
                    :
                    <div>Upload: <button onClick={this.onSend} disabled={!this.state.file || !this.state.recipient}>Start</button></div>
                }
            </div>
        );
    }


}

export default Upload;
