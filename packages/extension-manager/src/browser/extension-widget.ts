/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { h, VirtualNode } from '@phosphor/virtualdom/lib';
import { DisposableCollection, Disposable } from '@theia/core';
import { VirtualWidget, VirtualRenderer, OpenerService, open, DISABLED_CLASS } from '@theia/core/lib/browser';
import { Extension, ExtensionManager } from '../common';
import { ExtensionUri } from './extension-uri';

@injectable()
export class ExtensionWidget extends VirtualWidget {

    protected extensionStore: Extension[] = [];
    protected readonly updateTimeAfterTyping = 50;
    protected readonly toDisposeOnTypeSearchQuery = new DisposableCollection();
    protected readonly toDisposedOnFetch = new DisposableCollection();
    protected ready = false;

    constructor(
        @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager,
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) {
        super();
        this.id = 'extensions';
        this.title.label = 'Extensions';
        this.addClass('theia-extensions');

        this.fetchExtensions();
    }

    protected onActivateRequest() {
        this.update();
        this.fetchExtensions();
    }

    protected fetchExtensions() {
        this.toDisposedOnFetch.dispose();
        const htmlInputElement = (document.getElementById('extensionSearchField') as HTMLInputElement);
        const searchQuery = htmlInputElement ? htmlInputElement.value : '';
        this.extensionManager.list({
            query: searchQuery
        }).then(extensions => {
            this.extensionStore = extensions;
            extensions.forEach(ext => {
                this.toDisposedOnFetch.push(ext.onDidChange(() => {
                    this.update();
                }));
            });
            this.ready = true;
            this.update();
        });
    }

    protected render(): h.Child {
        if (this.ready) {
            return [this.renderSearchField(), this.renderExtensionList()];
        } else {
            const spinner = h.div({ className: 'fa fa-spinner fa-pulse fa-3x fa-fw' }, '');
            return h.div({ className: 'spinnerContainer' }, spinner);
        }
    }

    protected renderSearchField(): VirtualNode {
        const searchField = h.input({
            id: 'extensionSearchField',
            type: 'text',
            placeholder: 'Search theia extensions',
            onkeyup: event => {
                this.toDisposeOnTypeSearchQuery.dispose();
                const timer = setTimeout(() => this.fetchExtensions(), this.updateTimeAfterTyping);
                this.toDisposeOnTypeSearchQuery.push(Disposable.create(() => clearTimeout(timer)));
            }
        });

        const innerContainer = h.div({
            id: 'extensionSearchFieldContainer',
            className: 'flexcontainer'
        }, [searchField]);

        const container = h.div({
            id: 'extensionSearchContainer',
            className: 'flexcontainer'
        }, [innerContainer]);

        return container;
    }

    protected renderExtensionList(): VirtualNode {
        const theList: h.Child[] = [];
        this.extensionStore.forEach(extension => {
            const container = this.renderExtension(extension);
            theList.push(container);
        });

        return h.div({
            id: 'extensionListContainer'
        },
            VirtualRenderer.flatten(theList));
    }

    private renderExtension(extension: Extension) {
        const name = h.div({
            className: 'extensionName noWrapInfo'
        }, extension.name);

        const version = h.div({
            className: 'extensionVersion'
        }, extension.version);

        const author = h.div({
            className: 'extensionAuthor noWrapInfo flexcontainer'
        }, extension.author);

        const description = h.div({
            className: 'extensionDescription noWrapInfo'
        }, extension.description);

        const extensionButtonContainer = !extension.dependent ? h.div({
            className: 'extensionButtonContainer flexcontainer'
        }, this.createButton(extension)) : 'installed via ' + extension.dependent;

        const leftColumn = this.renderColumn(
            'extensionInformationContainer',
            this.renderRow(name, version),
            this.renderRow(description),
            this.renderRow(author, extensionButtonContainer));

        return h.div({
            className: this.createExtensionClassName(extension),
            onclick: () => open(this.openerService, ExtensionUri.toUri(extension.name))
        }, leftColumn);
    }

    protected createExtensionClassName(extension: Extension): string {
        const classNames = ['extensionHeaderContainer'];
        if (extension.dependent) {
            classNames.push(DISABLED_CLASS);
        }
        return classNames.join(' ');
    }

    protected renderRow(...children: h.Child[]): h.Child {
        return h.div({
            className: 'row flexcontainer'
        }, VirtualRenderer.flatten(children));
    }

    protected renderColumn(additionalClass?: string, ...children: h.Child[]): h.Child {
        return h.div({
            className: 'column flexcontainer ' + additionalClass
        }, VirtualRenderer.flatten(children));
    }

    protected createButton(extension: Extension): h.Child {
        let btnLabel = 'Install';
        if (extension.installed) {
            if (extension.outdated) {
                btnLabel = 'Update';
            } else {
                btnLabel = 'Uninstall';
            }
        }

        const content = extension.busy ? h.i({ className: 'fa fa-spinner fa-pulse fa-fw' }) : btnLabel;

        const btn = h.div({
            className: 'extensionButton' +
            (extension.busy ? ' working' : '') + ' ' +
            (extension.installed && !extension.busy ? ' installed' : '') + ' ' +
            (extension.outdated && !extension.busy ? ' outdated' : ''),
            onclick: event => {
                if (!extension.busy) {
                    if (extension.installed) {
                        if (extension.outdated) {
                            extension.update();
                        } else {
                            extension.uninstall();
                        }
                    } else {
                        extension.install();
                    }
                    this.update();
                    event.stopPropagation();
                }
            }
        }, content);

        return btn;
    }
}
